import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, normalize, resolve, sep } from 'node:path'
import { isDeepFamily, type DeepFamily } from './policy'

export interface BackupRecord {
  id: string
  stepId: string
  operation: string
  createdAt: string
  kind: 'proxy' | 'startup' | 'cache' | 'config' | 'state'
  data: Record<string, unknown>
}

/** Lab confinement: lab filesystem mutations stay inside the lab root; live backups stay in the app data directory. */
export class LabGuard {
  readonly labMode: boolean
  readonly labRoot?: string
  private readonly realLabRoot?: string
  private readonly dataDirectory?: string

  /**
   * Lab confinement: development TEST mutations stay inside labRoot.
   * Live repair backups stay in the app dataDirectory (trusted root),
   * so shipping repairs can undo without lab mode.
   */
  constructor(labRoot?: string, dataDirectory?: string) {
    if (dataDirectory && dataDirectory.trim() !== '') {
      mkdirSync(dataDirectory, { recursive: true })
      this.dataDirectory = resolve(dataDirectory)
    }
    if (labRoot && labRoot.trim() !== '') {
      this.labMode = true
      mkdirSync(labRoot, { recursive: true })
      this.realLabRoot = realpathSync(labRoot)
      const marker = join(this.realLabRoot, '.pocketbench-lab')
      if (!existsSync(marker)) writeFileSync(marker, 'PocketBench disposable lab directory. Safe to delete.\n')
      this.labRoot = this.realLabRoot
    } else {
      this.labMode = false
    }
  }

  assertLab(action: string): string {
    if (!this.labMode || !this.labRoot || !this.realLabRoot) {
      throw new Error(
        `${action} is available only in lab mode. Restart with --lab so changes stay inside a disposable lab directory.`,
      )
    }
    return this.realLabRoot
  }

  cacheDir(): string {
    // Live backups prefer the app data directory so undo works in the
    // shipping app; lab TEST state still uses the lab root.
    if (!this.labMode) {
      if (!this.dataDirectory) throw new Error('A data directory is required to store backups and logs.')
      const dir = join(this.dataDirectory, '.pocketbench')
      mkdirSync(dir, { recursive: true })
      this.confine(dir, this.dataDirectory, 'Backup storage')
      return dir
    }
    const root = this.assertLab('Local mutations')
    const dir = join(root, '.pocketbench')
    mkdirSync(dir, { recursive: true })
    this.confine(dir, root, 'Lab backup storage')
    return dir
  }

  quarantineDir(): string {
    // Live quarantine stays under the trusted app data directory; the lab
    // quarantine stays under the disposable lab root.
    const dir = join(this.liveMode() ? this.trustedDataDir() : this.cacheDir(), 'quarantine')
    mkdirSync(dir, { recursive: true })
    this.confine(dir, this.liveMode() ? this.trustedDataDir() : this.cacheDir(), 'Quarantine storage')
    return dir
  }

  /** Trusted app-root check: live host roots may only be the app data dir (or lab root in tests). */
  trustedDataDir(): string {
    if (!this.dataDirectory) throw new Error('A data directory is required to store backups and logs.')
    return this.dataDirectory
  }

  liveMode(): boolean {
    return !this.labMode
  }

  /**
   * Resolve a candidate path and prove it stays inside the expected root.
   * Rejects traversal, UNC paths, symlinks, and junctions (never follows them).
   */
  confine(candidate: string, root: string, what: string): string {
    if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 4096) {
      throw new Error(`${what}: path must be a non-empty string.`)
    }
    const normalized = normalize(candidate)
    if (normalized.includes('\0')) throw new Error(`${what}: path contains an invalid character.`)
    const lower = normalized.toLowerCase()
    if (lower.startsWith('\\\\') || lower.startsWith('//')) {
      throw new Error(`${what}: network paths are not supported.`)
    }
    for (let ancestor = resolve(root);;) {
      this.assertNotLink(ancestor, what)
      const parent = dirname(ancestor)
      if (parent === ancestor) break
      ancestor = parent
    }
    const realRoot = existsSync(root) ? realpathSync(root) : resolve(root)
    const absolute = resolve(realRoot, normalized)
    const withSep = realRoot.endsWith(sep) ? realRoot : realRoot + sep
    const compare = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value
    if (compare(absolute) !== compare(realRoot) && !compare(absolute).startsWith(compare(withSep))) {
      throw new Error(`${what}: path escapes its allowed directory.`)
    }
    // Refuse if the target itself or any existing ancestor is a link/reparse point.
    let cursor = existsSync(absolute) ? absolute : dirname(absolute)
    for (;;) {
      this.assertNotLink(cursor, what)
      if (cursor === realRoot || cursor === dirname(cursor)) break
      if (!cursor.startsWith(withSep)) break
      cursor = dirname(cursor)
    }
    return absolute
  }

  assertNotLink(path: string, what: string): void {
    let lst
    try {
      lst = lstatSync(path)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return
      throw new Error(`${what}: unable to inspect "${path}".`)
    }
    if (lst.isSymbolicLink()) throw new Error(`${what}: symbolic links are not followed ("${path}").`)
    const isReparse = (lst as unknown as { isReparsePoint?: () => boolean }).isReparsePoint?.()
    if (isReparse) throw new Error(`${what}: reparse points (junctions) are not followed ("${path}").`)
  }

  /** Quarantine a directory by moving it under the lab quarantine folder. */
  quarantineDirectory(sourceDir: string, family: DeepFamily): { backupId: string; destination: string } {
    if (!isDeepFamily(family)) throw new Error('Unknown application family.')
    const stat = statSync(sourceDir, { throwIfNoEntry: false })
    if (!stat || !stat.isDirectory()) throw new Error(`Cache path is not a directory: "${sourceDir}".`)
    this.assertNotLink(sourceDir, 'Cache quarantine')
    const destination = join(this.quarantineDir(), `${family}-${basename(sourceDir)}-${randomUUID().slice(0, 8)}`)
    const backupId = randomUUID()
    renameSync(sourceDir, destination)
    this.storeBackup({
      id: backupId,
      stepId: '',
      operation: 'app.quarantineCache',
      createdAt: new Date().toISOString(),
      kind: 'cache',
      data: { sourceDir, destination },
    })
    return { backupId, destination }
  }

  storeBackup(record: BackupRecord): void {
    const dir = this.cacheDir()
    writeFileSync(join(dir, `backup-${record.id}.json`), JSON.stringify(record, null, 2), { mode: 0o600 })
  }

  readBackup(id: string): BackupRecord {
    if (typeof id !== 'string' || !/^[0-9a-f-]{1,64}$/i.test(id)) throw new Error('Unknown backup identifier.')
    const file = join(this.cacheDir(), `backup-${id}.json`)
    if (basename(file) !== `backup-${id}.json`) throw new Error('Unknown backup identifier.')
    let parsed: BackupRecord
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8')) as BackupRecord
    } catch {
      throw new Error('Backup record is missing or unreadable; the change cannot be undone safely.')
    }
    if (!parsed || parsed.id !== id) throw new Error('Backup record does not match its identifier.')
    return parsed
  }

  /** Disposable directory used by the test suite for real lab-mode mutations. */
  static tempLab(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix))
    writeFileSync(join(dir, '.pocketbench-lab'), 'PocketBench disposable lab directory. Safe to delete.\n')
    return dir
  }

  static fingerprint(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex')
  }
}
