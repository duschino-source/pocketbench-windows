//! PocketBench engine core: pure, deterministic slices migrated from
//! TypeScript with fixture parity (tests/fixtures/golden.json).
//!
//! The TypeScript implementation remains the fallback behind
//! src/main/engine-bridge.ts; a slice may serve live traffic from Rust
//! only while both suites agree on every golden fixture.

pub mod confine;
pub mod policy;
#[cfg(feature = "windows-reads")]
pub mod reads;
pub mod sources;
pub mod winget;

#[cfg(feature = "napi")]
mod napi_api;

pub use confine::confine;
pub use policy::{is_selected_service, is_startup_blocked, is_winget_id, SELECTED_SERVICES};
pub use sources::{dangerous_check, public_source, publisher, source_gate, source_kind, GateSource};
pub use winget::{parse_winget_list_table, WingetRow};

/// Identity string the TypeScript bridge checks before trusting the addon.
pub const ENGINE_ID: &str = "pocketbench-engine/1";
