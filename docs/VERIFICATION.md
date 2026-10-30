# Verification record

Event build: October 30, 2026. These results describe implemented checks, not universal repair coverage.

- TypeScript checks and production Electron/React build passed.
- 74 automated unit/integration tests cover research sequencing, structured output, official/community source policy, invalid or malicious plans, execution/undo behavior, isolated Firefox/Steam/Obsidian data, protected paths, native argument validation, API failures, and incomplete or failed verification. Five environment-gated tests are skipped in the ordinary test command.
- Two gateway tests verify reservations, overspend rejection, retained unknown usage, authentication, allowed routes, token accounting, and provider-key redaction.
- Three native fault tests passed in a disposable GitHub-hosted Windows VM: a real current-user proxy was repaired and restored, W32Time was started and independently checked, and a temporary startup registry value was disabled and restored. They are guarded against execution on a developer host.
- Live Muse Spark search, structured drafting, independent review, execution, verification, and restoration passed for an isolated Windows proxy state. This case is a filesystem lab, distinct from the real Windows proxy test above.
- Live Muse Spark research found official Mozilla documentation, repaired real preference bytes in a disposable Firefox profile, and a real headless Firefox process reached an independent local HTTP endpoint afterward. The user's browser profile was not used.
  [Recorded live results and citations](live-model-results.json) distinguish this browser test from the Windows filesystem lab.
- A packaged read-only smoke scan found 260 installed entries on the development machine and verified that renderer Node access was unavailable. This count describes that machine, not a bundled demo dataset.
- Dependency audit reported no known vulnerabilities at build time.

Native Windows proxy/service/startup changes were never fault-injected into the developer's Windows environment. DISM/SFC is implemented behind elevation and independent checks but has not been tested against a deliberately corrupted Windows image. Real Steam/Obsidian GUI failures, denied interactive UAC, actual reboot recovery, multiple display DPI settings, and all vendor package installers have not been exhaustively exercised. The test suite includes their relevant guard/failure cases; it is not a substitute for those manual scenarios.

An unhelpful live search and malformed model output were observed during integration. Both withheld execution. Search targeting and schema-constrained responses were corrected; local validation remains authoritative. Search results can still be insufficient, in which case the app withholds an executable fix.

The release is unsigned. No signing certificate or model key is included in the public source or installers. The demo script calls out real operations and prohibits presenting fixtures as live Windows execution.
