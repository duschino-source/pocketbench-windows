<img src="resources/brand/lockup.png" alt="PocketBench — Windows and app repair" width="560" />

# PocketBench

[![Verify and package Windows](https://github.com/duschino-source/pocketbench-windows/actions/workflows/verify.yml/badge.svg)](https://github.com/duschino-source/pocketbench-windows/actions/workflows/verify.yml)
[![Latest release](https://img.shields.io/github/v/release/duschino-source/pocketbench-windows)](https://github.com/duschino-source/pocketbench-windows/releases/latest)
[![Windows](https://img.shields.io/badge/Windows-11%20x64-blue)](https://github.com/duschino-source/pocketbench-windows/releases/latest)

A Windows desktop repair agent powered by Meta Muse Spark. Investigate Windows and app problems, research version-specific fixes, review their impact, apply supported operations, and verify what changed.

## Windows download

Download the installer or portable build from [Releases](https://github.com/duschino-source/pocketbench-windows/releases/latest). Requires Windows 11 x64. The current build is unsigned, so Windows SmartScreen may display a warning. See [download verification](docs/SIGNING.md) for checksums and build provenance.

Open PocketBench, scan your PC, and describe a problem under Windows or select an installed app. Investigate lets Muse call bounded local Windows diagnostics, then uses live Meta web search, a structured repair draft, and an independent review. Review sources, affected resources, interruptions, backup coverage, and privileges, then choose **Apply fix**. Only supported local operations can execute. Windows may display UAC.

Settings accepts your Meta Model API key. Windows encrypts the stored key locally; the renderer and distributed packages never receive it. Redacted symptom, OS/app version, and selected diagnostic evidence are sent to Meta for investigation. Diagnostic records and repair backups remain local.

## Coverage

[Callable diagnostic tools](docs/TOOLS.md) provide fresh network, service, and event observations before a repair is researched. They are read-only; changes require the reviewed Apply fix workflow.

Windows operations cover manual user proxies, DNS cache, selected stopped services, DISM/SFC, and eligible current-user startup entries. App inventory includes registry and current-user Store apps. All inventoried apps can be investigated; executable coverage depends on current capabilities. Exact WinGet updates and deeper Firefox, Steam, and Obsidian operations are documented in [repair coverage](docs/REPAIR-COVERAGE.md).

Community sources can support execution only with independent corroboration. Missing evidence, conflicting sources, unknown operations, and invalid targets withhold execution. Success requires independent postcondition checks. A pending reboot remains pending; Undo is available only where restoration is supported.

## Development

Requires Windows 11 x64 and Node.js 24. Run `npm ci`, then `npm run dev`. Configure your own Meta Model API key in Settings.

`npm run check` runs type checking, automated tests, and the production build. `npm run dist` creates a Windows installer and portable executable without publishing.

See [architecture](docs/ARCHITECTURE.md) for the diagnostic, research, and repair workflow.
