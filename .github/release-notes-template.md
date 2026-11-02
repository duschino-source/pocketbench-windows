## PocketBench __TAG__ for Windows 11 x64

Windows and application repair powered by Meta Muse Spark. Pick the
installer (`PocketBench-Setup-__VERSION__.exe`) or the portable build
(`PocketBench-__VERSION__.exe`), install, open PocketBench, scan your PC,
and describe a problem. The release also carries `latest.yml` and the NSIS
blockmap for in-app updates.

### Before you run it

- Windows 11 x64 and your own Meta Model API key (Settings encrypts it
  locally with Windows safeStorage; the key is never bundled).
- This event build is **unsigned**: SmartScreen shows the standard
  warning. Every file below is checksummed, and the build carries free
  Sigstore provenance from this repository. See `docs/SIGNING.md`.

```powershell
Get-FileHash 'PocketBench-Setup-__VERSION__.exe' -Algorithm SHA256
# compare with SHA256SUMS.txt, then:
gh attestation verify 'PocketBench-Setup-__VERSION__.exe' --repo duschino-source/pocketbench-windows
```

### Judges and reviewers

- [Three-minute demo script](https://github.com/duschino-source/pocketbench-windows/blob/main/docs/DEMO.md)
- [Verification results](https://github.com/duschino-source/pocketbench-windows/blob/main/docs/VERIFICATION.md)
- [Repair coverage](https://github.com/duschino-source/pocketbench-windows/blob/main/docs/REPAIR-COVERAGE.md)
- [Submission checklist](https://github.com/duschino-source/pocketbench-windows/blob/main/docs/USER-CHECKLIST.md)
