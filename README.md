# PocketBench

A Windows desktop repair agent powered by Meta Muse Spark. Investigate Windows and app problems, research version-specific fixes, review their impact, apply supported operations, and verify what changed.

Built during the Meta Global AI Developer Hackathon, beginning October 30, 2026. Custom implementation and contribution records are maintained in this standalone repository.

## Development

Requires Windows 11 x64 and Node.js 24. Run `npm install`, then `npm run dev`. Configure your own Meta Model API key in Settings. Credentials stay on your computer and are never included in the application package.

`npm run check` runs type checking, automated tests, and the production build. `npm run dist` creates a Windows installer and portable executable.

Repairs execute through validated local operations. Only independently verified outcomes are marked Fixed. Research covers installed applications; executable repair coverage depends on an applicable operation and verification.
