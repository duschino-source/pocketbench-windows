# Callable Windows diagnostics

PocketBench's guided local investigation can invoke eight real read-only local functions with deterministic routing and no API key:

- windows_network: current Windows adapter/profile/proxy state, DNS resolution, and a TLS-verified HEAD request to one fixed allow-listed hostname (default `www.microsoft.com`). Public IP validation and address pinning prevent private destinations and DNS rebinding. Redirects are reported, never followed.
- windows_service: status, start mode, and bounded recent Service Control Manager events for one selected service.
- windows_events: bounded error/critical observations from System or WindowsUpdateClient Operational. The time window is 1–24 hours; the result limit is 1–8 events.
- windows_update_readiness: read-only Windows Update readiness observations (fixed route: `hours: 24, maxEvents: 5`).
- windows_resource_pressure: read-only resource pressure observations (fixed route: `durationSeconds: 2, sampleCount: 3`).
- windows_storage: read-only volume and cache storage observations (fixed route: `maxEntries: 25`).
- windows_startup: read-only startup inventory observations (fixed route: `maxEntries: 25`).
- app_health: read-only application health observations for one known app family only. Unknown or unsupported families probe nothing.

Routing is deterministic: the same category and options always produce the same ordered calls with only fixed tools, fixed allow-listed hosts, and bounded numeric parameters. Categories are `performance`, `network`, `updates`, and `app`. Each investigation owns a per-run dedup/freshness cache (default TTL 60 s); concurrent identical calls share one loader and stale entries are discarded.

Guided local routing needs no API key. Each investigation runs its fixed route to completion with a per-run cache; only sanitized scope/observations/timestamps leave the tool boundary and the raw tool payload is never copied into evidence. Only native observations become DiagnosticEvidence. Model prose is not local evidence. Paths, IP addresses, account and machine identities, SIDs, MAC addresses, and common secrets are minimized before tool results return. The selected observations are also available in repair review. Old tool observations are replaced for each investigation.

The network probe uses direct Node HTTPS to one host. It does not exercise browser settings, WinINET/user proxies, or application/VPN policy. An HTTP response establishes that this endpoint was reached, not that every application works. Diagnostic collection status describes the check, not the health of Windows. Unavailable collection is informational and does not create a spurious system warning.

These functions cannot change Windows. The only offline candidate is starting one fixed, selected, stopped, automatic, non-trigger Windows service observed by a successful fresh probe (freshness bound 120 s); unavailable, partial, stale, trigger-start, or failed probes are rejected. Offline plans are never ready and never approved, carry no executed command, and still require a fresh scan, the normal controller validation, user review, and independent postcondition verification. Lab mode skips live host-tool collection. No token, cost, savings, latency, or coverage figures are claimed here.

## Verification

- Unit checks cover argument schemas, call pairing, limits, redaction, reserved addresses, pinned requests, denied reads, timeouts, and narrative-only model responses.
- An opt-in read-only Windows smoke test exercised the network, service, and event functions. Microsoft returned HTTP 200; BITS reported Running/Auto; both event channels were readable.
- Live Muse Spark function-calling tests invoked Windows service and network tools and received actual local results. The recorded evidence is in [live-tool-results.json](live-tool-results.json).
- Final combined verification: 157 passed, 8 skipped; typecheck, build, and UI check passed. Focused 32 passed (19 controller + 13 local); gateway 3 passed separately, run from root.
- Offline export builder returns a candidate with `needs-validation`; only the Controller re-scans canonical state and promotes to `ready` iff a fresh stopped automatic non-trigger-start service is observed. Actual apply re-checks and independently verifies. Local model/budget fixtures count 0 (diagnostic agent for structured vs legacy 1 mocked-agent invocation); no-key report path makes 0 model calls. Mock research invocation is not called; one actual model request uses the research internal 3-stage flow. No live token/savings claims.
- Run native checks with POCKETBENCH_NATIVE_DIAGNOSTICS=1 and npx vitest run tests/diagnostic-native-smoke.test.ts. Paid model checks require POCKETBENCH_LIVE_MODEL=1 and the metered gateway configuration; ordinary CI has no model key.
