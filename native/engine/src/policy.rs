//! Fixed allow-lists and validators. Mirrors src/main/windows/policy.ts.
//! Model input can never extend these lists.

/// TS: SELECTED_SERVICES (exact, case-sensitive).
pub const SELECTED_SERVICES: [&str; 7] = [
    "Dnscache", "Dhcp", "NlaSvc", "W32Time", "BITS", "wuauserv", "Winmgmt",
];

pub fn is_selected_service(value: &str) -> bool {
    SELECTED_SERVICES.contains(&value)
}

fn is_id_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-')
}

/// TS: WINGET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}\.[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/
/// The middle class already contains dots, so any dot position that splits
/// the value into two valid 2..=64 char segments satisfies the pattern.
pub fn is_winget_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    let segment_ok = |seg: &[u8]| -> bool {
        (2..=64).contains(&seg.len())
            && seg[0].is_ascii_alphanumeric()
            && seg.iter().all(|&b| is_id_char(b))
    };
    bytes.iter().enumerate().any(|(i, &b)| {
        b == b'.' && segment_ok(&bytes[..i]) && segment_ok(&bytes[i + 1..])
    })
}

/// True when `needle` appears in `text` right after `prefix`, allowing one
/// optional separator character between them (TS: prefix + ".?" / "[_ -]?").
fn follows_with_optional_char(text: &str, prefix: &str, needle: &str, any_char: bool) -> bool {
    let mut search_from = 0;
    while let Some(found) = text[search_from..].find(prefix) {
        let start = search_from + found + prefix.len();
        let rest = &text[start..];
        if rest.starts_with(needle) {
            return true;
        }
        let mut chars = rest.char_indices();
        if let Some((_, first)) = chars.next() {
            let ok_sep = if any_char { true } else { matches!(first, '_' | ' ' | '-') };
            if ok_sep {
                let next = chars.next().map(|(i, _)| i).unwrap_or(rest.len());
                if rest[next..].starts_with(needle) {
                    return true;
                }
            }
        }
        search_from = start;
    }
    false
}

fn has_word(text: &str, word: &str) -> bool {
    text.split(|c: char| !c.is_ascii_alphanumeric())
        .any(|token| token == word)
}

/// TS: SECURITY_STARTUP_PATTERN (case-insensitive, fail closed).
pub fn is_startup_blocked(value: &str) -> bool {
    let text = value.to_lowercase();
    const SUBSTRINGS: [&str; 16] = [
        "defender",
        "securityhealth",
        "antivirus",
        "antimalware",
        "firewall",
        "bitdefender",
        "norton",
        "mcafee",
        "kaspersky",
        "avast",
        "eset",
        "sophos",
        "malwarebytes",
        "sentinelone",
        "crowdstrike",
        "windowssecurity",
    ];
    if SUBSTRINGS.iter().any(|s| text.contains(s)) {
        return true;
    }
    if has_word(&text, "avg") {
        return true;
    }
    follows_with_optional_char(&text, "security", "center", false)
        || follows_with_optional_char(&text, "carbon", "black", false)
        || follows_with_optional_char(&text, "windows", "security", true)
        || follows_with_optional_char(&text, "security", "protection", true)
}
