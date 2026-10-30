# Callable Windows diagnostics

PocketBench's investigation agent can invoke three real read-only local functions before web research:

- windows_network: current Windows adapter/profile/proxy state, DNS resolution, and a TLS-verified HEAD request to one allow-listed vendor/support hostname. Public IP validation and address pinning prevent private destinations and DNS rebinding. Redirects are reported, never followed.
- windows_service: status, start mode, and bounded recent Service Control Manager events for one of the seven supported services.
- windows_events: bounded error/critical observations from System or WindowsUpdateClient Operational. The time window is 1–24 hours; the result limit is 1–8 events.

The agent has at most two model rounds and four validated tool attempts. It uses Meta Responses function_call/function_call_output pairing and stateless encrypted reasoning replay through the same metered gateway. Unknown names, invalid JSON, extra arguments, duplicate call IDs, unavailable reads, and timed-out probes cannot become successful observations.

Only native observations become DiagnosticEvidence. Model prose is not local evidence. Paths, IP addresses, account and machine identities, SIDs, MAC addresses, and common secrets are minimized before tool results return to Meta. The selected observations are also available in repair review. Old tool observations are replaced for each investigation.

The network probe uses direct Node HTTPS to one host. It does not exercise browser settings, WinINET/user proxies, or application/VPN policy. An HTTP response establishes that this endpoint was reached, not that every application works. Diagnostic collection status describes the check, not the health of Windows. Unavailable collection is informational and does not create a spurious system warning.

These functions cannot change Windows. Applying a repair still requires an applicable reviewed plan, local target/precondition validation, the disclosed Apply fix click, a fixed executor operation, and independent postcondition verification. Lab mode skips live host-tool collection.

## Verification

- Unit checks cover argument schemas, call pairing, limits, redaction, reserved addresses, pinned requests, denied reads, timeouts, and narrative-only model responses.
- An opt-in read-only Windows smoke test exercised all three functions. Microsoft returned HTTP 200; BITS reported Running/Auto; both event channels were readable.
- Live Muse Spark function-calling tests invoked Windows service and network tools and received actual local results. The recorded evidence is in [live-tool-results.json](live-tool-results.json).
- Run native checks with POCKETBENCH_NATIVE_DIAGNOSTICS=1 and npx vitest run tests/diagnostic-native-smoke.test.ts. Paid model checks require POCKETBENCH_LIVE_MODEL=1 and the metered gateway configuration; ordinary CI has no model key.

Meta protocol reference: [Tool calling](https://dev.meta.ai/docs/tool-calling), [Responses API](https://dev.meta.ai/docs/protocols/responses).
