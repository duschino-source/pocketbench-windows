# Release v0.2.0 notes (uncommitted working tree)

Status: working tree only. Nothing below claims a published release, a signed
installer, or a real version-to-version upgrade test on this host.

## Scope of this note

- UI/updater/release-validation files only: `src/renderer/**`,
  `src/main/updater.ts`, `src/main/index.ts`, `src/preload/index.ts`,
  `tools/check-ui.cjs`, `tests/updater.test.ts`, `tests/renderer.test.ts`,
  `docs/**`, `README.md`, `.github/workflows/verify.yml`, and package metadata
  where required.
- Backend controller/Windows/diagnostics/local-investigation and backend tests
  remain owned by the backend worker and were not edited here.

## UI fixes

- Operation progress no longer places the ticking elapsed timer inside the
  `role="status"` live region. The timer is `aria-hidden`; only the operation
  message is announced politely.
- Progress and update percentages render only when the backend supplies a real,
  finite 0–100 value. Out-of-range, non-numeric, or missing values render no
  meter and no fabricated percentage.
- Offline guided form always submits a symptom category when one is selected,
  including with no API key. The submit path stays disabled until a scan has
  run and an affected area is selected. The default visible path remains
  reachable: app inspectors preselect `app`, and Windows/Overview investigations
  reuse the same category mapping.
- Windows diagnostics rows and Overview findings no longer gate investigation on
  API-key presence in the renderer. Backend authorization remains authoritative.
- Motion remains strict: page/entry feedback is 120–240 ms transform/opacity,
  navigation and selection receive no repeated animation, and
  `prefers-reduced-motion` disables animation/transitions. Canvas and sidebar
  remain true black `#000000`.

## Updater behavior (unsigned manual gate)

- `trustedPublisher` remains `false`; the current release remains unsigned.
- `autoDownload = false` and `autoInstallOnAppQuit = false` remain enforced.
- No silent install on quit.
- `install()` refuses while the controller reports busy.
- Check/download/prompt paths defer while servicing/repair work is busy:
  concurrent `check()` returns current state without polling, an available
  update waits for download until idle, and out-of-range download progress is
  ignored rather than clamped.

## Update tests

- Existing tests continue to cover version gating, manual fallback, explicit
  idle install, signature/error refusal, offline/malformed recovery, and check
  deduplication.
- Added busy-deferral coverage, real-percent-only coverage, and a preservation
  check in a disposable-profile/mock upgrade path. The preservation check does
  not claim a real installer upgrade was tested.

## Measured validation on this machine

- `npm run typecheck`: passed.
- `npm test`: 157 passed, 8 skipped across ordinary suites (final combined verification).
- Focused suites: 32 passed (19 controller + 13 local-investigation).
- Gateway tests: 3 passed, run separately from root.
- `npm run build`: passed; renderer, main, and preload bundles emitted to `out/`.
- `node tools/check-ui.cjs`: passed. Fixture harness reports true-black canvas
  and sidebar, minimum text contrast 5.92:1 across 171 checked states/routes,
  native-icon image loading, reduced motion, instant navigation, and no
  horizontal overflow at 100%, 150%, and 200% renderer zoom.
- Offline export builder returns a candidate with `needs-validation`; only the
  Controller re-scans canonical state and promotes to `ready` iff a fresh probe
  shows a stopped automatic non-trigger service. Actual apply re-checks targets
  and independently verifies.
- Local model/budget fixtures count 0; structured path uses the diagnostic
  agent vs legacy 1 mocked-agent invocation. No-key report path makes 0 model
  calls; mock research invocation is not called. One actual model request uses
  the research internal 3-stage flow.
- No live token, cost, savings, latency, or coverage figures beyond the measured
  values above are claimed.

## Packaging readiness

- `npm run dist` remains available for installer, portable, `latest.yml`, and
  blockmap generation.
- Do not publish and do not commit from this scoped task.
- GitHub helper material under `.local` was not enumerated recursively and no
  secret material was read.

## Contributions

- DeepSeek authored the diagnostic tools and investigation UI.
- Muse provided safety review and integration.
- Codex orchestrates (early Codex edits shared integration work before the user requested coordination-only).

## Backend tests

- Final: focused 32 passed (19 controller + 13 local-investigation); combined
  `npm test` 157 passed, 8 skipped; gateway 3 passed separately from root.
- Source contributions done. FINAL source freeze after these changes; do not
  build, commit, or publish from this task.
