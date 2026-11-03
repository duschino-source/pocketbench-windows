//! Parity with the TypeScript engine over tests/fixtures/golden.json —
//! the same file asserted by tests/engine-golden.test.ts. Both suites
//! must agree before a slice may serve live traffic from Rust.

use pocketbench_engine::{
    confine, dangerous_check, is_selected_service, is_startup_blocked, is_winget_id,
    parse_winget_list_table, public_source, source_gate, source_kind, GateSource,
};
use serde_json::Value;
use std::path::PathBuf;

fn golden() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/golden.json");
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("golden fixtures unreadable at {}: {e}", path.display()));
    serde_json::from_str(&text).expect("golden fixtures are valid JSON")
}

fn as_str<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}

#[test]
fn winget_tables_match_typescript() {
    let doc = golden();
    for fixture in doc["winget"].as_array().expect("winget fixtures") {
        let scope = if as_str(fixture, "sourceScope") == "winget" {
            Some("winget")
        } else {
            None
        };
        let rows = parse_winget_list_table(as_str(fixture, "input"), scope);
        let actual: Vec<Value> = rows
            .iter()
            .map(|r| {
                serde_json::json!({
                    "name": r.name, "id": r.id, "version": r.version, "source": r.source
                })
            })
            .collect();
        assert_eq!(
            actual,
            fixture["expected"].as_array().cloned().unwrap_or_default(),
            "fixture: {}",
            as_str(fixture, "name")
        );
    }
}

#[test]
fn allow_lists_match_typescript() {
    let doc = golden();
    for fixture in doc["wingetIds"].as_array().expect("id fixtures") {
        assert_eq!(
            is_winget_id(as_str(fixture, "input")),
            fixture["expected"].as_bool().unwrap(),
            "id: {}",
            as_str(fixture, "input")
        );
    }
    for fixture in doc["services"].as_array().expect("service fixtures") {
        assert_eq!(
            is_selected_service(as_str(fixture, "input")),
            fixture["expected"].as_bool().unwrap(),
            "service: {}",
            as_str(fixture, "input")
        );
    }
    for fixture in doc["startupBlocked"].as_array().expect("startup fixtures") {
        assert_eq!(
            is_startup_blocked(as_str(fixture, "input")),
            fixture["expected"].as_bool().unwrap(),
            "startup: {}",
            as_str(fixture, "input")
        );
    }
}

#[test]
fn source_policy_matches_typescript() {
    let doc = golden();
    for fixture in doc["sourceUrls"].as_array().expect("url fixtures") {
        let expected = as_str(fixture, "expected");
        match public_source(as_str(fixture, "input")) {
            Ok(href) => assert_eq!(href, expected, "url: {}", as_str(fixture, "input")),
            Err(_) => assert_eq!(expected, "error", "url: {}", as_str(fixture, "input")),
        }
    }
    for fixture in doc["sourceKinds"].as_array().expect("kind fixtures") {
        let kind = source_kind(as_str(fixture, "url"), as_str(fixture, "target"))
            .expect("fixture URLs are valid");
        assert_eq!(kind, as_str(fixture, "expected"), "kind: {}", as_str(fixture, "url"));
    }
    for fixture in doc["gates"].as_array().expect("gate fixtures") {
        let operation = as_str(fixture, "operation").to_string();
        let sources: Vec<GateSource> = fixture["sources"]
            .as_array()
            .expect("gate sources")
            .iter()
            .map(|s| GateSource {
                url: as_str(s, "url").to_string(),
                kind: source_kind(as_str(s, "url"), "Windows").expect("gate URL valid"),
                supports: as_str(s, "supports").to_string(),
                applicable: true,
                has_concerns: false,
                corroborated_by: s["corroboratedBy"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default()
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect(),
            })
            .collect();
        let blocked = !source_gate(std::slice::from_ref(&operation), &sources).is_empty();
        assert_eq!(
            blocked,
            fixture["expectedBlocked"].as_bool().unwrap(),
            "gate: {}",
            as_str(fixture, "name")
        );
    }
    for fixture in doc["dangerous"].as_array().expect("danger fixtures") {
        // TS stringifies the step list; the title carries the probe text.
        let text = serde_json::json!([{ "title": as_str(fixture, "title") }]).to_string();
        let verdict = dangerous_check(&text);
        match fixture["expected"].as_str() {
            None => assert_eq!(verdict, None, "danger: {}", as_str(fixture, "title")),
            Some(expected) => assert_eq!(
                verdict,
                Some(expected),
                "danger: {}",
                as_str(fixture, "title")
            ),
        }
    }
}

#[test]
fn confinement_scenarios_match_typescript() {
    let root = std::env::temp_dir().join(format!(
        "pocketbench-parity-{}",
        std::process::id()
    ));
    std::fs::create_dir_all(&root).expect("temp root");
    let inside = confine("nested/file.txt", &root, "Parity").expect("inside path allowed");
    assert!(inside.ends_with("nested/file.txt") || inside.ends_with("nested\\file.txt"));
    assert!(confine("../escape.txt", &root, "Parity")
        .unwrap_err()
        .contains("escapes"));
    assert!(confine("\\\\server\\share\\file.txt", &root, "Parity")
        .unwrap_err()
        .contains("network"));
    assert!(confine("", &root, "Parity").unwrap_err().contains("non-empty"));
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn winget_id_rejects_generated_junk() {
    // Generated-input sweep: the validator must never accept values with
    // spaces, slashes, or empty segments, whatever surrounds them.
    let alphabet = ["a", "Z", "0", ".", "-", "_", " ", "/", "\\", ""];
    for a in alphabet {
        for b in alphabet {
            for c in alphabet {
                let candidate = format!("{a}{b}{c}");
                if candidate.contains([' ', '/', '\\']) {
                    assert!(!is_winget_id(&candidate), "accepted junk: {candidate:?}");
                }
            }
        }
    }
    assert!(is_winget_id("Mozilla.Firefox"));
    assert!(!is_winget_id("Mozilla."));
    assert!(!is_winget_id(".Firefox"));
}
