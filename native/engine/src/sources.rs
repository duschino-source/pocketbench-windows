//! Source provenance policy. Mirrors src/main/source-policy.ts, including
//! the trailing-dot publisher hardening (a host like `reddit.com.` must
//! group with `reddit.com`, never as a distinct publisher).

use std::net::IpAddr;
use url::Url;

const BLOCKED_FINAL_LABELS: [&str; 5] = ["localhost", "local", "internal", "invalid", "test"];

/// TS: publicSource(). Returns the normalized href with fragment removed.
pub fn public_source(value: &str) -> Result<String, String> {
    // Hardening (mirrored in TS): URL parsers silently repair whitespace,
    // control characters, and backslashes. Reject them before parsing so a
    // repaired URL can never differ from the URL that was reviewed.
    if value.chars().any(|c| c.is_control() || c == '\\') || value.trim() != value {
        return Err("Source must be a public HTTPS URL".into());
    }
    let mut url = Url::parse(value).map_err(|_| "Source must be a public HTTPS URL".to_string())?;
    let host = url.host_str().unwrap_or("");
    let is_ip = host.parse::<IpAddr>().is_ok() || (host.starts_with('[') && host.ends_with(']'));
    let final_label = host.rsplit('.').next().unwrap_or("").to_lowercase();
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || is_ip
        || !host.contains('.')
        || BLOCKED_FINAL_LABELS.contains(&final_label.as_str())
    {
        return Err("Source must be a public HTTPS URL".into());
    }
    url.set_fragment(None);
    Ok(url.to_string())
}

/// TS: sourceKind(). Classification is by exact host only, never by label.
pub fn source_kind(value: &str, target_name: &str) -> Result<String, String> {
    let href = public_source(value)?;
    let url = Url::parse(&href).map_err(|_| "Source must be a public HTTPS URL".to_string())?;
    let host = url.host_str().unwrap_or("").to_lowercase();
    let path = url.path().to_lowercase();
    if ["support.microsoft.com", "learn.microsoft.com", "www.microsoft.com", "devblogs.microsoft.com"]
        .contains(&host.as_str())
    {
        return Ok(if path.contains("/answers/") || path.contains("/community/") {
            "community".into()
        } else {
            "official".into()
        });
    }
    let target = target_name.to_lowercase();
    if target.contains("firefox")
        && ["support.mozilla.org", "www.mozilla.org", "firefox-source-docs.mozilla.org"].contains(&host.as_str())
    {
        return Ok(if path.contains("/questions/") { "community".into() } else { "official".into() });
    }
    if target.contains("steam") && ["help.steampowered.com", "store.steampowered.com"].contains(&host.as_str()) {
        return Ok("official".into());
    }
    if target.contains("obsidian") && ["help.obsidian.md", "obsidian.md", "www.obsidian.md"].contains(&host.as_str()) {
        return Ok("official".into());
    }
    Ok("community".into())
}

/// TS: publisher(). Sibling subdomains group together; trailing dot ignored.
pub fn publisher(value: &str) -> Result<String, String> {
    let href = public_source(value)?;
    let url = Url::parse(&href).map_err(|_| "Source must be a public HTTPS URL".to_string())?;
    let host = url.host_str().unwrap_or("").to_lowercase();
    let host = host.strip_suffix('.').unwrap_or(&host);
    let host = host.strip_prefix("www.").unwrap_or(host);
    let labels: Vec<&str> = host.split('.').collect();
    Ok(if labels.len() > 2 {
        labels[labels.len() - 2..].join(".")
    } else {
        host.to_string()
    })
}

#[derive(Debug, Clone)]
pub struct GateSource {
    pub url: String,
    pub kind: String,
    pub supports: String,
    pub applicable: bool,
    pub has_concerns: bool,
    pub corroborated_by: Vec<String>,
}

/// TS: sourceGate(). One reason string per unsatisfied operation.
pub fn source_gate(operations: &[String], sources: &[GateSource]) -> Vec<String> {
    let mut reasons = Vec::new();
    for operation in operations {
        let applicable: Vec<&GateSource> = sources
            .iter()
            .filter(|s| s.applicable && !s.has_concerns && s.supports.contains(operation.as_str()))
            .collect();
        if applicable.iter().any(|s| s.kind == "official") {
            continue;
        }
        let mut publishers = std::collections::HashSet::new();
        for source in &applicable {
            if source.kind != "community" {
                continue;
            }
            let own = publisher(&source.url).unwrap_or_default();
            let corroborated = source.corroborated_by.iter().any(|other| {
                applicable.iter().any(|candidate| {
                    &candidate.url == other
                        && publisher(&candidate.url).map(|p| p != own).unwrap_or(false)
                })
            });
            if corroborated {
                publishers.insert(own);
            }
        }
        if publishers.len() < 2 {
            reasons.push(format!(
                "{operation}: requires an applicable official source or two corroborating independent community publishers."
            ));
        }
    }
    reasons
}

fn window_contains(text: &str, verb_end: usize, nouns: &[&str]) -> bool {
    // TS: verb + .{0,50} + noun, over the lowercased JSON text.
    let rest = text.get(verb_end..).unwrap_or("");
    let window: String = rest.chars().take(50).collect();
    nouns.iter().any(|noun| window.contains(noun))
}

fn window_text(text: &str, verb_end: usize) -> String {
    let rest = text.get(verb_end..).unwrap_or("");
    rest.chars().take(50).collect()
}

/// TS: dangerousPlan(). Input is the same JSON text TS stringifies.
/// Returns Some("security") / Some("unsupported") / None (TS checks security first).
pub fn dangerous_check(text: &str) -> Option<&'static str> {
    let lower = text.to_lowercase();
    let verbs = ["disable", "turn off", "turnoff", "turn-off", "bypass", "remove"];
    let nouns = ["defender", "antivirus", "anti-malware", "firewall"];
    for verb in verbs {
        let mut from = 0;
        while let Some(found) = lower[from..].find(verb) {
            let end = from + found + verb.len();
            if window_contains(&lower, end, &nouns) {
                return Some("security");
            }
            // secure.?boot / security.?protection / bare "uac" word.
            let window = window_text(&lower, end);
            if window.contains("secure boot")
                || window.contains("secureboot")
                || window.contains("security protection")
                || window.contains("securityprotection")
                || window.split(|c: char| !c.is_ascii_alphanumeric()).any(|t| t == "uac")
            {
                return Some("security");
            }
            from = end;
        }
    }
    // "turnXoff" with an arbitrary single separator character.
    if lower.contains("turn") {
        let bytes = lower.as_bytes();
        for i in 0..bytes.len().saturating_sub(7) {
            if &lower[i..i + 4] == "turn" && lower[i + 5..].starts_with("off") {
                let end = i + 7;
                if window_contains(&lower, end, &nouns) {
                    return Some("security");
                }
            }
        }
    }
    const UNSUPPORTED: [&str; 6] = [
        "format volume",
        "format-volume",
        "formatvolume",
        "diskpart",
        "remove-item",
        "encodedcommand",
    ];
    if UNSUPPORTED.iter().any(|s| lower.contains(s)) {
        return Some("unsupported");
    }
    if lower.contains("downloadstring") || lower.contains("invoke-expression") {
        return Some("unsupported");
    }
    // TS: rm\s+-rf — substring scan, tolerant of surrounding JSON quotes.
    let mut from = 0;
    while let Some(found) = lower[from..].find("rm") {
        let rest = &lower[from + found + 2..];
        let rest = rest.trim_start_matches(|c: char| c.is_whitespace());
        if rest.starts_with("-rf") {
            return Some("unsupported");
        }
        from += found + 2;
    }
    // TS: iex\b — the three letters as a standalone word.
    if lower
        .split(|c: char| !c.is_ascii_alphanumeric())
        .any(|t| t == "iex")
    {
        return Some("unsupported");
    }
    None
}
