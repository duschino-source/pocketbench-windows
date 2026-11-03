//! Direct Windows reads (feature = "windows-reads"). First migrated
//! family: the current-user WinINET proxy state that TypeScript reads
//! through resources/windows/user.ps1 (`getProxy`). Read-only registry
//! access; every caller keeps the PowerShell path as fallback, and the
//! elevated helper (DISM/SFC/UAC) is explicitly out of scope here.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProxyState {
    pub enable: u32,
    pub server: String,
}

/// REG_DWORD payloads are little-endian u32s (pure; unit-tested).
pub fn dword_from_bytes(bytes: &[u8]) -> Option<u32> {
    let raw: [u8; 4] = bytes.get(..4)?.try_into().ok()?;
    Some(u32::from_le_bytes(raw))
}

/// REG_SZ / REG_EXPAND_SZ payloads are UTF-16LE, NUL-terminated (pure).
pub fn string_from_bytes(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .take_while(|unit| *unit != 0)
        .collect();
    String::from_utf16_lossy(&units).trim().to_string()
}

#[cfg(windows)]
pub fn read_user_proxy() -> Result<ProxyState, String> {
    use windows::core::{w, PCWSTR};
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
        REG_DWORD, REG_EXPAND_SZ, REG_SZ,
    };

    fn query(
        key: HKEY,
        name: PCWSTR,
    ) -> Result<(windows::Win32::System::Registry::REG_VALUE_TYPE, Vec<u8>), String> {
        let mut kind = windows::Win32::System::Registry::REG_VALUE_TYPE::default();
        let mut size: u32 = 0;
        let status = unsafe {
            RegQueryValueExW(key, name, None, Some(&mut kind), None, Some(&mut size))
        };
        if status != ERROR_SUCCESS {
            return Err(format!("Registry value unavailable ({status:?})."));
        }
        let mut buffer = vec![0u8; size as usize];
        let status = unsafe {
            RegQueryValueExW(
                key,
                name,
                None,
                Some(&mut kind),
                Some(buffer.as_mut_ptr()),
                Some(&mut size),
            )
        };
        if status != ERROR_SUCCESS {
            return Err(format!("Registry read failed ({status:?})."));
        }
        buffer.truncate(size as usize);
        Ok((kind, buffer))
    }

    let mut key = HKEY::default();
    let status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            w!("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"),
            None,
            KEY_READ,
            &mut key,
        )
    };
    if status != ERROR_SUCCESS {
        return Err(format!("Proxy settings key unavailable ({status:?})."));
    }
    let read = (|| -> Result<ProxyState, String> {
        let (enable_kind, enable_bytes) = query(key, w!("ProxyEnable"))?;
        if enable_kind != REG_DWORD {
            return Err("ProxyEnable has an unexpected registry type.".into());
        }
        let enable = dword_from_bytes(&enable_bytes)
            .ok_or_else(|| "ProxyEnable payload is truncated.".to_string())?;
        // A missing ProxyServer value means no server string, not an error.
        let server = match query(key, w!("ProxyServer")) {
            Ok((kind, bytes)) if kind == REG_SZ || kind == REG_EXPAND_SZ => {
                string_from_bytes(&bytes)
            }
            _ => String::new(),
        };
        Ok(ProxyState { enable, server })
    })();
    unsafe {
        let _ = RegCloseKey(key);
    }
    read
}

#[cfg(not(windows))]
pub fn read_user_proxy() -> Result<ProxyState, String> {
    Err("Direct proxy reads are available only on Windows.".into())
}

#[cfg(test)]
mod tests {
    use super::{dword_from_bytes, string_from_bytes};

    #[test]
    fn decodes_registry_payloads() {
        assert_eq!(dword_from_bytes(&[1, 0, 0, 0]), Some(1));
        assert_eq!(dword_from_bytes(&[0, 0, 0, 0]), Some(0));
        assert_eq!(dword_from_bytes(&[1, 0]), None);
        let utf16: Vec<u8> = "proxy:8080\0"
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect();
        assert_eq!(string_from_bytes(&utf16), "proxy:8080");
        assert_eq!(string_from_bytes(&[]), "");
    }
}
