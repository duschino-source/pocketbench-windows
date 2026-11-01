import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Regression: src/main/index.ts must default-import the CJS electron-updater
// module and destructure autoUpdater. A named ESM import
// (`import { autoUpdater } from 'electron-updater'`) fails to link against the
// CJS package before main startup. Never access the `autoUpdater` getter here:
// it constructs a platform updater outside Electron.
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgRequire = createRequire(join(root, 'package.json'))

describe('electron-updater CJS interop', () => {
  it('src/main/index.ts default-imports electron-updater instead of a named import', () => {
    const source = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    expect(source).toMatch(/import\s+electronUpdater\s+from\s+['"]electron-updater['"]/)
    expect(source).toMatch(/const\s*\{\s*autoUpdater\s*\}\s*=\s*electronUpdater/)
    expect(source).not.toMatch(/import\s*\{[^}]*autoUpdater[^}]*\}\s*from\s*['"]electron-updater['"]/)
  })

  it('default import resolves the CJS module without constructing the updater', () => {
    const mod = pkgRequire('electron-updater') as Record<string, unknown>
    // ESM default-import interop resolves to module.exports itself.
    expect(mod).toBeTypeOf('object')
    // autoUpdater is exposed lazily via a getter; confirm presence by
    // descriptor only so no Electron updater is constructed in Node.
    const descriptor = Object.getOwnPropertyDescriptor(mod, 'autoUpdater')
    expect(descriptor).toBeDefined()
    expect(typeof (descriptor?.get ?? descriptor?.value)).toBe('function')
  })

  it('built main keeps electron-updater external without a named ESM link', () => {
    const built = join(root, 'out/main/index.js')
    if (!existsSync(built)) return
    const js = readFileSync(built, 'utf8')
    expect(js).toMatch(/electron-updater/)
    expect(js).not.toMatch(/import\s*\{[^}]*autoUpdater[^}]*\}\s*from\s*['"]electron-updater['"]/)
  })
})
