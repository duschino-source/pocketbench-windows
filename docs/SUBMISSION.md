# Submission packet

Deadline: **November 4, 2026, 6 PM Pacific / 9 PM Eastern.**
Submit: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit

Copy these values into the form. Items marked TODO are the only remaining
manual steps; everything else is done in this repository.

## Form values

- Repository: https://github.com/duschino-source/pocketbench-windows
- Windows download: https://github.com/duschino-source/pocketbench-windows/releases/latest
- Demo video (max 3 minutes): TODO — upload unlisted, paste link here and in
  `README.md`, confirm it plays without requesting permission.
- Track: Indie Developer (default proposal; confirm on the form).
- Problem statement: Push the Frontier.
- Human team members: TODO — list every approved human collaborator.
  AI tools (Codex, Muse Spark, Muse Code) are tools, not team members;
  they are credited in `CONTRIBUTIONS.md`.

## Judge quickstart (put this in the submission notes)

1. Download the installer from Releases, install, open PocketBench.
2. Scan the PC, describe a Windows or app problem, review sources and
   impact, Apply fix. Windows may display UAC.
3. Verify the download if desired: `SHA256SUMS.txt` plus
   `gh attestation verify <file> --repo duschino-source/pocketbench-windows`.
4. Read `docs/VERIFICATION.md` for what was tested and the honest limits.

## Release cut checklist (maintainer)

1. `npm run check` green on main; review `docs/VERIFICATION.md`.
2. Tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
   `release.yml` builds, smoke-tests the installer, writes the SBOM and
   checksums, attests provenance, and opens a draft GitHub Release.
3. Review the draft: confirm both `.exe` files, the blockmap, `latest.yml`,
   `SHA256SUMS.txt`, and the SBOM; spot-check one hash and one attestation, then publish.
4. Record the demo from `docs/DEMO.md` in a disposable VM only.
