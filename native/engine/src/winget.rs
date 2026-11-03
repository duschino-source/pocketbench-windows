//! Winget `list` table parsing. Mirrors `parseWingetListTable` in
//! src/main/windows.ts exactly; parity is proven against
//! tests/fixtures/golden.json by both test suites.

use serde::Serialize;

use crate::policy::is_winget_id;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WingetRow {
    pub name: String,
    pub id: String,
    pub version: String,
    pub source: String,
}

/// Strip ANSI CSI sequences: ESC [ params final-letter (TS: /\x1b\[[0-9;?]*[A-Za-z]/g).
fn strip_ansi(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == 0x1b && i + 1 < bytes.len() && bytes[i + 1] == b'[' {
            let mut j = i + 2;
            while j < bytes.len() && (bytes[j].is_ascii_digit() || bytes[j] == b';' || bytes[j] == b'?') {
                j += 1;
            }
            if j < bytes.len() && bytes[j].is_ascii_alphabetic() {
                i = j + 1;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// TS String.slice semantics: clamp to bounds, never panic on UTF-8 edges.
fn slice(text: &str, start: i64, end: i64) -> String {
    let len = text.len() as i64;
    let mut s = start.clamp(0, len);
    let mut e = end.clamp(0, len);
    if e < s {
        e = s;
    }
    while s > 0 && !text.is_char_boundary(s as usize) {
        s -= 1;
    }
    while e > s && !text.is_char_boundary(e as usize) {
        e -= 1;
    }
    text[s as usize..e as usize].to_string()
}

fn find(haystack: &str, needle: &str) -> i64 {
    haystack.find(needle).map(|i| i as i64).unwrap_or(-1)
}

fn is_separator(line: &str) -> bool {
    // TS: /^\s*-{5,}\s*$/ — only whitespace and at least five dashes.
    let trimmed = line.trim();
    trimmed.len() >= 5 && trimmed.bytes().all(|b| b == b'-')
}

pub fn parse_winget_list_table(text: &str, source_scope: Option<&str>) -> Vec<WingetRow> {
    let cleaned = strip_ansi(text);
    let lines: Vec<&str> = cleaned.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect();
    let Some(separator) = lines.iter().position(|l| is_separator(l)) else {
        return Vec::new();
    };
    if separator < 1 {
        return Vec::new();
    }
    let header = lines[separator - 1];
    let id_at = find(header, "Id");
    let version_at = find(header, "Version");
    let source_at = header.rfind("Source").map(|i| i as i64).unwrap_or(-1);
    let available_at = find(header, "Available");
    let scope_is_winget = source_scope == Some("winget");
    if id_at < 1 || version_at <= id_at || (source_at <= version_at && !scope_is_winget) {
        return Vec::new();
    }
    let mut rows = Vec::new();
    for line in &lines[separator + 1..] {
        let len = line.len() as i64;
        let name = slice(line, 0, id_at).trim().to_string();
        let id = slice(line, id_at, version_at).trim().to_string();
        let version_end = if available_at > version_at {
            available_at
        } else if source_at > version_at {
            source_at
        } else {
            len
        };
        let version = slice(line, version_at, version_end).trim().to_string();
        let source = if source_at > version_at {
            slice(line, source_at, len).trim().to_string()
        } else {
            source_scope.unwrap_or("").to_string()
        };
        let probe = format!("{name}{id}");
        if name.is_empty() || probe.contains("...") || probe.contains('\u{2026}') || !is_winget_id(&id) {
            continue;
        }
        if source.to_lowercase() != "winget" {
            continue;
        }
        rows.push(WingetRow { name, id, version, source });
    }
    rows
}
