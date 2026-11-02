# Signing status

PocketBench installers are **not Authenticode-signed**: there is no free
public-trust Windows code-signing certificate, so SmartScreen shows the
standard warning for unsigned downloads. That is expected for this event
build and is stated on every release.

What every release ships instead, all free:

- `SHA256SUMS.txt` with hashes of every release file.
- `pocketbench-sbom.cyclonedx.json`, a CycloneDX software bill of materials.
- Sigstore build provenance from GitHub Actions, bound to this repository
  and the exact build that produced the files.

## Verify a download

```powershell
# 1. Check the hash (example file name).
Get-FileHash 'PocketBench Setup 0.1.0.exe' -Algorithm SHA256
Get-Content SHA256SUMS.txt  # compare the matching line

# 2. Check the Sigstore provenance (needs the GitHub CLI).
gh attestation verify 'PocketBench Setup 0.1.0.exe' --repo duschino-source/pocketbench-windows
```

Both checks passing means the file is exactly what CI built from the
tagged commit. Neither check removes the SmartScreen prompt; only a
public-trust certificate does that.

## Adding Authenticode later

`release.yml` already passes signing secrets through to electron-builder,
so no code change is needed when a certificate is available. Set any one
of these paths up as repository secrets:

- `WIN_CSC_LINK` (base64 PFX) + `WIN_CSC_KEY_PASSWORD`: standard
  Authenticode certificate. Free for open source through
  [SignPath](https://about.signpath.io/product/open-source) once the
  project is approved there.
- Azure Trusted Signing (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`,
  `AZURE_CLIENT_SECRET`, `AZURE_ENDPOINT`, `AZURE_CODE_SIGNING_NAME`):
  pay-per-sign Microsoft service with a trial; the workflow forwards
  these variables when present.

Until then, `verify.yml` builds with `CSC_IDENTITY_AUTO_DISCOVERY=false`
so a stray local certificate can never silently sign a CI artifact.

## Local self-signed testing only

`tools/new-dev-cert.ps1` creates a throwaway self-signed certificate for
testing the signed-install flow on your own machine. It confers no trust,
must never be committed (output goes to ignored `.local/`), and expires
quickly by design.
