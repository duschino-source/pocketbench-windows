import type { UpdateState } from '../shared/contracts'

export const RELEASES_URL = 'https://github.com/duschino-source/pocketbench-windows/releases/latest'
const RELEASE_API = 'https://api.github.com/repos/duschino-source/pocketbench-windows/releases/latest'

/** Narrow adapter keeps Electron and network side effects out of updater tests. */
export interface UpdateAdapter {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  allowDowngrade: boolean
  setFeedURL(options: { provider: 'github'; owner: string; repo: string; private: boolean }): void
  on(event: string, listener: (...args: unknown[]) => void): unknown
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

function versionParts(value: unknown): number[] | null {
  if (typeof value !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(value)) return null
  const parts = value.replace(/^v/, '').split('.').map(Number)
  return parts.every(Number.isSafeInteger) ? parts : null
}
export function newerStable(candidate: unknown, current: string): boolean {
  const next = versionParts(candidate), previous = versionParts(current)
  if (!next || !previous) return false
  for (let i = 0; i < 3; i++) if (next[i] !== previous[i]) return next[i] > previous[i]
  return false
}

async function latestRelease(): Promise<unknown> {
  const response = await fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000), redirect: 'error' })
  if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub update checks are temporarily rate limited. Try again later.' : 'Could not check GitHub for updates. Try again when online.')
  return response.json()
}

export class UpdateManager {
  private state: UpdateState
  private checking: Promise<UpdateState> | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private ready = false
  private downloading = false
  constructor(private options: {
    currentVersion: string; installed: boolean; trustedPublisher: boolean
    adapter: UpdateAdapter; isBusy: () => boolean; changed: (state: UpdateState) => void
    latest?: () => Promise<unknown>
  }) {
    this.state = { status: 'idle', supported: options.installed, trustedPublisher: options.trustedPublisher, releaseUrl: RELEASES_URL }
    const adapter = options.adapter
    adapter.autoDownload = false
    adapter.autoInstallOnAppQuit = false
    adapter.allowPrerelease = false
    adapter.allowDowngrade = false
    adapter.setFeedURL({ provider: 'github', owner: 'duschino-source', repo: 'pocketbench-windows', private: false })
    adapter.on('error', () => this.fail('Update download or verification failed. Your current version is unchanged.'))
    adapter.on('update-available', info => {
      if (!this.automatic || !info || typeof info !== 'object' || !('version' in info) || !newerStable(info.version, options.currentVersion)) return
      // Defer downloads while a repair/servicing operation is running.
      if (options.isBusy()) {
        this.ready = false
        this.emit({ status: 'available', version: String(info.version), message: 'An update is available. Download will start after the current operation finishes.' })
        return
      }
      this.ready = false
      this.emit({ status: 'available', version: String(info.version), message: 'An update is available.' })
      if (!this.downloading) {
        this.downloading = true
        this.emit({ status: 'downloading', message: 'Downloading update. You can keep using PocketBench.' })
        void adapter.downloadUpdate().catch(() => this.fail('Update download or verification failed. Try again later.')).finally(() => { this.downloading = false })
      }
    })
    adapter.on('update-not-available', () => { if (!this.ready) this.emit({ status: 'idle', message: 'PocketBench is up to date.', percent: undefined }) })
    adapter.on('download-progress', progress => {
      if (!this.automatic || !this.downloading || !progress || typeof progress !== 'object' || !('percent' in progress) || typeof progress.percent !== 'number' || !Number.isFinite(progress.percent)) return
      // Real percent only: never clamp or fabricate. Out-of-range values stay unreported.
      const value = progress.percent as number
      if (value < 0 || value > 100) return
      this.emit({ status: 'downloading', percent: value })
    })
    adapter.on('update-downloaded', info => {
      if (!this.automatic || !info || typeof info !== 'object' || !('version' in info) || !newerStable(info.version, options.currentVersion)) return
      this.ready = true
      this.emit({ status: 'downloaded', version: String(info.version), percent: 100, message: 'Ready to install. Restart when your work is finished.' })
    })
  }
  private get automatic(): boolean { return this.options.installed && this.options.trustedPublisher }
  private emit(change: Partial<UpdateState>): void { this.state = { ...this.state, ...change }; this.options.changed(this.getState()) }
  private fail(message: string): void { this.ready = false; this.emit({ status: 'error', message, percent: undefined }) }
  getState(): UpdateState { return { ...this.state } }
  start(): void {
    if (this.timer) return
    void this.check()
    this.timer = setInterval(() => { void this.check() }, 6 * 60 * 60 * 1000)
    this.timer.unref?.()
  }
  dispose(): void { if (this.timer) clearInterval(this.timer); this.timer = null }
  check(): Promise<UpdateState> {
    if (this.checking) return this.checking
    if (this.ready || this.downloading) return Promise.resolve(this.getState())
    // Never prompt, download, or poll for updates while servicing/repair work is running.
    if (this.options.isBusy()) return Promise.resolve(this.getState())
    this.checking = this.performCheck().finally(() => { this.checking = null })
    return this.checking
  }
  private async performCheck(): Promise<UpdateState> {
    this.emit({ status: 'checking', message: 'Checking GitHub for updates.', percent: undefined })
    try {
      if (this.automatic) await this.options.adapter.checkForUpdates()
      else {
        const release = await (this.options.latest || latestRelease)()
        if (!release || typeof release !== 'object' || !('tag_name' in release) || !('draft' in release) || !('prerelease' in release) || release.draft !== false || release.prerelease !== false || !versionParts(release.tag_name)) throw new Error('GitHub returned invalid release information.')
        const version = String(release.tag_name).replace(/^v/, '')
        const available = newerStable(version, this.options.currentVersion)
        this.emit({ status: 'manual', version: available ? version : undefined, message: available ? `Version ${version} is available. ${this.options.installed ? 'Automatic installation requires a verified signing publisher.' : 'Portable builds are updated manually.'} Download it from GitHub.` : 'PocketBench is up to date. Future updates can be downloaded from GitHub.' })
      }
    } catch (error) { this.fail(error instanceof Error && /^(GitHub|Could not check)/.test(error.message) ? error.message : 'Update check failed. Try again when online.') }
    return this.getState()
  }
  install(): void {
    if (!this.automatic || !this.ready || this.state.status !== 'downloaded') throw new Error('No verified update is ready to install.')
    if (this.options.isBusy()) throw new Error('Finish the current operation before restarting to update.')
    // Explicit click only. The adapter never installs automatically on application exit.
    this.options.adapter.quitAndInstall(false, true)
  }
}
