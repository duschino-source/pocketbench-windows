import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Writes release/SHA256SUMS.txt in `sha256  filename` form for the release
// executables only. Same 2-exe contract the gated release flow verifies
// (tools/publish-release.mjs --prepare); latest.yml, blockmaps, and the SBOM
// are covered by Sigstore provenance instead of this file.
const dir = 'release'
const names = readdirSync(dir).filter((name) => /\.exe$/i.test(name) && statSync(join(dir, name)).isFile()).sort()
if (!names.length) throw new Error('release/ has no executables. Run `npm run dist` first.')
const lines = names.map((name) => `${createHash('sha256').update(readFileSync(join(dir, name))).digest('hex')}  ${name}`)
writeFileSync(join(dir, 'SHA256SUMS.txt'), lines.join('\n') + '\n')
console.log(lines.join('\n'))
