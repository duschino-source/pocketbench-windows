//! Node-API surface (feature = "napi"). JSON strings in/out so the
//! TypeScript bridge validates every payload before use. Panics are
//! caught and reported as errors: the addon must never crash the
//! Electron main process — the bridge falls back to TypeScript instead.

use napi_derive::napi;

use crate::{parse_winget_list_table, public_source, ENGINE_ID};

fn guarded<T>(body: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(body)) {
        Ok(result) => result,
        Err(_) => Err("Native engine panic contained; TypeScript fallback required.".into()),
    }
}

#[napi]
pub fn engine_info() -> String {
    ENGINE_ID.to_string()
}

/// Parses a winget table; returns a JSON array of {name,id,version,source}.
#[napi]
pub fn parse_winget_table(text: String, source_scope: Option<String>) -> napi::Result<String> {
    let rows = guarded(|| {
        let parsed = parse_winget_list_table(&text, source_scope.as_deref());
        serde_json::to_string(&parsed).map_err(|e| e.to_string())
    })
    .map_err(napi::Error::from_reason)?;
    Ok(rows)
}

/// Returns the normalized source href, or an empty string when rejected.
#[napi]
pub fn validate_source_url(value: String) -> napi::Result<String> {
    let href = guarded(|| Ok(public_source(&value).unwrap_or_default()))
        .map_err(napi::Error::from_reason)?;
    Ok(href)
}

/// Current-user proxy state as JSON ({enable, server}); empty string when
/// the direct read is unavailable and PowerShell must be used instead.
#[cfg(feature = "windows-reads")]
#[napi]
pub fn read_user_proxy_json() -> napi::Result<String> {
    let json = guarded(|| match crate::reads::read_user_proxy() {
        Ok(state) => serde_json::to_string(&state).map_err(|e| e.to_string()),
        Err(_) => Ok(String::new()),
    })
    .map_err(napi::Error::from_reason)?;
    Ok(json)
}
