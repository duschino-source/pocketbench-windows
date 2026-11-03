//! Lab path confinement. Mirrors the lexical contract of LabGuard.confine
//! in src/main/windows/lab.ts: reject empties, NULs, UNC paths, escapes,
//! and any symlink/junction component. Never follows links.

use std::path::{Component, Path, PathBuf};

fn lexical_normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn is_link(path: &Path) -> bool {
    match std::fs::symlink_metadata(path) {
        Ok(meta) => meta.file_type().is_symlink(),
        Err(_) => false,
    }
}

fn compare_key(path: &Path) -> String {
    let text = path.to_string_lossy().replace('/', "\\");
    if cfg!(windows) {
        text.to_lowercase()
    } else {
        text
    }
}

/// Prove `candidate` (relative to `root`) stays inside `root`.
/// Errors are messages, matching the TS throw-on-violation contract.
pub fn confine(candidate: &str, root: &Path, what: &str) -> Result<PathBuf, String> {
    if candidate.is_empty() || candidate.len() > 4096 {
        return Err(format!("{what}: path must be a non-empty string."));
    }
    if candidate.contains('\0') {
        return Err(format!("{what}: path contains an invalid character."));
    }
    if candidate.starts_with("\\\\") || candidate.starts_with("//") {
        return Err(format!("{what}: network paths are not supported."));
    }
    // Root ancestors must not be links (TS checks every ancestor of root).
    let mut ancestor = Some(root);
    while let Some(path) = ancestor {
        if is_link(path) {
            return Err(format!("{what}: symbolic links are not followed."));
        }
        ancestor = path.parent();
    }
    let real_root = match std::fs::canonicalize(root) {
        Ok(path) => path,
        Err(_) => lexical_normalize(&root.to_path_buf()),
    };
    let joined = lexical_normalize(&real_root.join(candidate));
    let root_key = compare_key(&real_root);
    let joined_key = compare_key(&joined);
    let with_sep = format!("{root_key}\\");
    if joined_key != root_key && !joined_key.starts_with(&with_sep) {
        return Err(format!("{what}: path escapes its allowed directory."));
    }
    // Target and every existing ancestor down from the root must not be links.
    let mut cursor = if joined.exists() {
        joined.clone()
    } else {
        joined.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| joined.clone())
    };
    loop {
        if is_link(&cursor) {
            return Err(format!("{what}: symbolic links are not followed."));
        }
        if compare_key(&cursor) == root_key {
            break;
        }
        match cursor.parent() {
            Some(parent) if compare_key(&joined).starts_with(&with_sep) => {
                cursor = parent.to_path_buf();
            }
            _ => break,
        }
    }
    Ok(joined)
}
