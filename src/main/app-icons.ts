import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import type { AppTarget } from '../shared/contracts'
import { LabGuard } from './windows/lab'

export interface IconTarget { app: AppTarget; registeredIcon?: string; store: boolean }
type ExtractIcon = (file: string, image: boolean) => Promise<string | null>
const guard = new LabGuard()

function localFile(value: string): string | null {
  if (!isAbsolute(value) || /^(?:\\\\|\/\/|[A-Za-z]+:\/\/)/.test(value) || /[\x00-\x1f<>"]/.test(value) || value.slice(2).includes(':')) return null
  try {
    const file = guard.confine(value, dirname(value), 'Program icon')
    return existsSync(file) && lstatSync(file).isFile() ? file : null
  } catch { return null }
}
function registeredFile(value: string): string {
  return value.trim().replace(/^"([^"]+)"(?:\s*,\s*-?\d+)?$/, '$1').replace(/,\s*-?\d+$/, '')
}
function storeImage(location: string): string | null {
  if (!isAbsolute(location) || /^(?:\\\\|\/\/)/.test(location)) return null
  try {
    const manifest = localFile(join(location, 'AppxManifest.xml'))
    if (!manifest || lstatSync(manifest).size > 1024 * 1024) return null
    const xml = readFileSync(manifest, 'utf8')
    const matches = [...xml.matchAll(/(?:Square44x44Logo|Square150x150Logo|Logo)\s*=\s*"([^"]+)"/g)]
    for (const match of matches) {
      const relative = match[1]
      if (isAbsolute(relative) || /[:&]/.test(relative) || !/\.png$/i.test(relative)) continue
      const candidate = guard.confine(resolve(location, relative), location, 'Store icon')
      const exact = localFile(candidate)
      if (exact) return exact
      const folder = dirname(candidate), prefix = basename(candidate, extname(candidate)).toLowerCase()
      guard.confine(folder, location, 'Store icon folder')
      if (!existsSync(folder)) continue
      const variants = readdirSync(folder).filter(name => {
        const lower = name.toLowerCase()
        return lower.startsWith(prefix + '.') && /\.(?:scale-\d+|targetsize-\d+(?:_altform-unplated)?)\.png$/.test(lower)
      }).sort((a, b) => Number(!/targetsize-(?:32|44|48)_altform-unplated/i.test(a)) - Number(!/targetsize-(?:32|44|48)_altform-unplated/i.test(b)) || a.localeCompare(b))
      for (const variant of variants) {
        const file = localFile(guard.confine(join(folder, variant), location, 'Store icon variant'))
        if (file) return file
      }
    }
  } catch { /* Unreadable or unsafe package assets use the Windows application fallback. */ }
  return null
}
export class AppIcons {
  private cache = new Map<string, Promise<string | null>>()
  constructor(private lookup: (id: string) => IconTarget | undefined, private extract: ExtractIcon) {}
  get(id: unknown): Promise<string | null> {
    if (typeof id !== 'string' || !id || id.length > 120) return Promise.reject(new Error('Invalid application identifier'))
    const target = this.lookup(id)
    if (!target) return Promise.reject(new Error('Application is not in the current inventory'))
    const key = [id, target.app.version, target.registeredIcon, target.app.executable, target.app.installLocation].join('|')
    const cached = this.cache.get(key)
    if (cached) return cached
    if (this.cache.size > 1000) this.cache.clear()
    const result = this.load(target)
    this.cache.set(key, result)
    return result
  }
  private async load(target: IconTarget): Promise<string | null> {
    const candidates = [target.registeredIcon ? registeredFile(target.registeredIcon) : '', target.app.executable || '']
    for (const candidate of candidates) {
      if (!/\.(?:exe|ico)$/i.test(candidate)) continue
      const file = localFile(candidate)
      if (!file) continue
      try {
        const data = await this.extract(file, false)
        if (data && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data) && data.length < 200000) return data
      } catch { /* Try the next discovered icon source. */ }
    }
    if (target.store && target.app.installLocation) {
      const image = storeImage(target.app.installLocation)
      if (image && lstatSync(image).size <= 2 * 1024 * 1024) {
        const signature = readFileSync(image).subarray(0, 8)
        if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null
        try {
          const data = await this.extract(image, true)
          if (data && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data) && data.length < 200000) return data
        } catch { /* A missing image uses the fallback. */ }
      }
    }
    return null
  }
}

