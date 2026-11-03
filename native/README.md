# PocketBench native engine

Rust core for the Windows engine, migrated slice by slice from TypeScript
behind [src/main/engine-bridge.ts](../src/main/engine-bridge.ts). The
TypeScript implementation in `src/main/windows.ts` and `src/main/windows/*`
remains the fallback and stays authoritative until a shipped build has
proven the Rust path (plan Step 10).

## Layout

- `engine/src/winget.rs` — `winget list` table parsing (mirrors `parseWingetListTable`).
- `engine/src/policy.rs` — fixed service/ID/startup allow-lists (mirrors `windows/policy.ts`).
- `engine/src/sources.rs` — source URL, kind, publisher, gate, dangerous-plan checks (mirrors `source-policy.ts`).
- `engine/src/confine.rs` — lab path confinement (mirrors `LabGuard.confine`).
- `engine/src/reads.rs` — direct registry proxy read (`windows-reads` feature; verification only — backup-critical reads stay on PowerShell until Rust returns full proxy fidelity).
- `engine/src/napi_api.rs` — Node-API exports (feature `napi`): JSON in/out, panics contained.

## Parity contract

`tests/fixtures/golden.json` is asserted by both `tests/engine-golden.test.ts`
and `engine/tests/parity.rs`. A slice may serve live traffic from Rust only
while both suites agree on every fixture. Live use today:

- Winget parsing in `scan()` when `POCKETBENCH_ENGINE=rust` and the addon
  loads and identifies as `pocketbench-engine/1` (see `parseWingetRows`).
- Proxy verification reads through `readProxyForVerify()` under the same
  opt-in. Every failure falls back to TypeScript/PowerShell; the addon can
  never crash the main process or authorize a repair by itself.

The elevated helper (`resources/windows/elevate.ps1`, DISM/SFC/UAC) is out
of scope for migration in this pass.

## Commands

```powershell
npm run test:rust     # cargo test (pure slices + parity + read decoders)
npm run build:native  # release addon -> engine/pocketbench-engine.node
```

Local toolchains may live under `.local/` (gitignored): set `CARGO_HOME`
and `RUSTUP_HOME` there, and build from a Visual Studio Developer shell so
the MSVC linker is available. CI provides both via `verify.yml`.
