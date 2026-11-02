# Verification record

Event build: October 30, 2026. These results describe implemented checks, not universal repair coverage.

- TypeScript checks and production Electron/React build passed.
- 104 automated unit/integration tests cover research sequencing, structured output, official/community source policy, invalid or malicious plans, execution/undo behavior, isolated Firefox/Steam/Obsidian data, protected paths, native argument validation, API failures, and incomplete or failed verification. Eight environment-gated tests are skipped in the ordinary test command.
- Three gateway tests verify reservations, overspend rejection, retained unknown usage, authentication, allowed routes, token accounting, and provider-key redaction, and fixed-price development image requests.
- Three native fault tests passed in a disposable GitHub-hosted Windows VM: a real current-user proxy was repaired and restored, W32Time was started and independently checked, and a temporary startup registry value was disabled and restored. They are guarded against execution on a developer host.
- Live Muse Spark search, structured drafting, independent review, execution, verification, and restoration passed for an isolated Windows proxy state. This case is a filesystem lab, distinct from the real Windows proxy test above.
- Live Muse Spark research found official Mozilla documentation, repaired real preference bytes in a disposable Firefox profile, and a real headless Firefox process reached an independent local HTTP endpoint afterward. The user's browser profile was not used.
  [Recorded live results and citations](live-model-results.json) distinguish this browser test from the Windows filesystem lab.
- A packaged read-only smoke scan found 260 installed entries on the development machine and verified that renderer Node access was unavailable. This count describes that machine, not a bundled demo dataset.
- Dependency audit reported no known vulnerabilities at build time.

Native Windows proxy/service/startup changes were never fault-injected into the developer's Windows environment. DISM/SFC is implemented behind elevation and independent checks but has not been tested against a deliberately corrupted Windows image. Real Steam/Obsidian GUI failures, denied interactive UAC, actual reboot recovery, multiple display DPI settings, and all vendor package installers have not been exhaustively exercised. The test suite includes their relevant guard/failure cases; it is not a substitute for those manual scenarios.

An unhelpful live search and malformed model output were observed during integration. Both withheld execution. Search targeting and schema-constrained responses were corrected; local validation remains authoritative. Search results can still be insufficient, in which case the app withholds an executable fix.

The release is unsigned. No signing certificate or model key is included in the public source or installers. The demo script calls out real operations and prohibits presenting fixtures as live Windows execution. Releases carry SHA256 checksums, a CycloneDX SBOM, and Sigstore build provenance instead; see [signing](SIGNING.md).


The true-black UI update adds native program icon checks: Firefox, Steam, and Obsidian icons were extracted from installed programs, and the Windows generic application icon was read through SHGetStockIconInfo. Unit checks cover discovered-ID access, caching, UNC/URL rejection, links, Store asset confinement, and malformed output. The icon export tool validates every PNG frame and ICO offset.


Live Meta function-calling and actual read-only Windows service/network probes passed. [Tool coverage and limits](TOOLS.md) and [recorded local observations](live-tool-results.json) describe the new functionality. The isolated UI harness also verified native-icon image loading through the bridge, true-black canvas/sidebar, text contrast (minimum 5.92:1 in tested states), no repeated navigation/app-selection animation, reduced motion, and no horizontal overflow at 100%, 150%, and 200% renderer zoom. These fixture checks do not imply exhaustive testing of every possible diagnostic state or physical display configuration.

Scoped UI/updater validation for the uncommitted v0.2.0 working tree: typecheck passed; full tests report 143 passed with 8 skipped across 14 files; scoped renderer/updater suites report 21 passed; production build passed; isolated UI QA passed. The operation timer no longer sits inside the polite live region, percentages render only from real finite backend values, category-guided offline investigation remains submittable without an API key, and unsigned update checks defer during busy servicing work. Update coverage includes busy deferral, real-percent handling, and a disposable-profile/mock preservation check; no real installer upgrade is claimed. Details are in [release v0.2.0 notes](RELEASE-v0.2.0.md).

## November 2 hardening (this checkout)

- TypeScript checks, the production build, and 74 automated tests (5 environment-gated skips) pass, matching the October 30 baseline.
- The renderer now code-splits secondary views: the initial bundle is 388 KB instead of one 973 KB file, with 3–10 KB per lazy view. Total build output is about 515 KB versus about 1.1 MB.
- The read-only scan batches service status and start-mode lookups (2 queries instead of 14) with a per-service fallback, keeping the same JSON shape and service order. A dev-host run returned all 16 keys, 7 services in order, and 192 apps; CIM values were unavailable inside the restricted verification sandbox, so real-Windows start-mode behavior is covered by CI native tests and release smoke checks.
- Gateway credential tests: reservation/overspend checks pass; the loopback-listener test cannot bind inside the sandbox. Gateway files are unchanged; CI runs both tests.
- `npm run sbom` emits valid CycloneDX, `tools/hashes.mjs` was exercised on a fixture, and the self-signed dev-cert helper plus every workflow PowerShell block parse cleanly.
- Full installer packaging (`npm run dist`) needs network-downloaded NSIS tools, which the sandbox blocks; it runs in `verify.yml` and the new `release.yml` on tag push instead.

The demo script calls out real operations and prohibits presenting fixtures as live Windows execution.
