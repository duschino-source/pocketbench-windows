# Security policy

## Supported

Event build `0.1.x` on Windows 11 x64, installed from this repository's
[Releases](https://github.com/duschino-source/pocketbench-windows/releases/latest).

## Reporting

Open a public issue for anything that is not sensitive. For credential
handling or elevation problems, contact the repository owner directly and
do not include API keys, credential files, or `.local/` content.

## Boundaries this project keeps

- No API key is ever committed or bundled. Distributed users supply their
  own Meta Model API key in Settings; Windows safeStorage encrypts it and
  plaintext fallback is refused.
- The renderer is sandboxed and context-isolated; only `window.pocketbench`
  is exposed. No Node, filesystem, or arbitrary IPC access from UI code.
- Repairs execute only fixed local operations against currently discovered
  targets. Model output and web content are never executed as shell.
- Releases ship `SHA256SUMS.txt`, a CycloneDX SBOM, and Sigstore build
  provenance (see `docs/SIGNING.md`).
