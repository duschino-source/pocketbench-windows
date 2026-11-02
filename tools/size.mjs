import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Prints per-file sizes under out/ and release/ to track bundle/installer bloat.
for (const dir of ['out', 'release']) {
  let files = []
  try {
    files = readdirSync(dir, { recursive: true, encoding: 'utf8' })
  } catch {
    console.log(`# ${dir} (missing)`)
    continue
  }
  console.log(`# ${dir}`)
  const rows = []
  for (const name of files) {
    try {
      const size = statSync(join(dir, name)).size
      if (statSync(join(dir, name)).isFile()) rows.push({ name, size })
    } catch { /* ignore transient entries */ }
  }
  rows.sort((a, b) => b.size - a.size)
  for (const row of rows) console.log(`${(row.size / 1024).toFixed(1).padStart(10)} KB  ${row.name}`)
  console.log(`${(rows.reduce((sum, row) => sum + row.size, 0) / 1024).toFixed(1).padStart(10)} KB  TOTAL`)
}
