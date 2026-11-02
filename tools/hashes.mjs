import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Writes release/SHA256SUMS.txt in `sha256  filename` form for every file in
// release/. Same format the GitHub workflows generate with Get-FileHash.
const dir = 'release'
const names = readdirSync(dir).filter((name) => name !== 'SHA256SUMS.txt' && statSync(join(dir, name)).isFile()).sort()
if (!names.length) throw new Error('release/ has no files. Run `npm run dist` first.')
const lines = names.map((name) => `${createHash('sha256').update(readFileSync(join(dir, name))).digest('hex')}  ${name}`)
writeFileSync(join(dir, 'SHA256SUMS.txt'), lines.join('\n') + '\n')
console.log(lines.join('\n'))
