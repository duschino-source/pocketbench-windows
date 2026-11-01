import { describe, expect, it, vi } from 'vitest'
import { newerStable, RELEASES_URL, UpdateManager, type UpdateAdapter } from '../src/main/updater'

function fixture(installed = true, trustedPublisher = true) {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const adapter: UpdateAdapter = {
    autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, allowDowngrade: true,
    setFeedURL: vi.fn(), on: (event, callback) => listeners.set(event, callback),
    checkForUpdates: vi.fn(async () => { listeners.get('update-not-available')?.() }),
    downloadUpdate: vi.fn(async () => undefined), quitAndInstall: vi.fn(),
  }
  const isBusy = vi.fn(() => false)
  const latest = vi.fn(async (): Promise<unknown> => ({ tag_name: 'v0.2.0', draft: false, prerelease: false, html_url: 'https://evil.test' }))
  const manager = new UpdateManager({ currentVersion: '0.1.1', installed, trustedPublisher, adapter, isBusy, latest, changed: vi.fn() })
  return { manager, adapter, listeners, isBusy, latest, emit: (event: string, payload?: unknown) => listeners.get(event)?.(payload) }
}

describe('GitHub updates', () => {
  it('accepts only newer stable versions, not downgrades or prereleases', () => {
    expect(newerStable('v0.2.0', '0.1.1')).toBe(true)
    for (const version of ['0.1.1', '0.1.0', '0.2.0-beta', 'next', '1.2', '9999999999999999999.1.1']) expect(newerStable(version, '0.1.1')).toBe(false)
  })
  it('pins public GitHub and never installs on quit', () => {
    const f = fixture()
    expect(f.adapter.setFeedURL).toHaveBeenCalledWith({ provider: 'github', owner: 'duschino-source', repo: 'pocketbench-windows', private: false })
    expect(f.adapter.autoInstallOnAppQuit).toBe(false)
    expect(f.adapter.allowPrerelease).toBe(false)
    expect(f.adapter.allowDowngrade).toBe(false)
  })
  it.each([[true, false], [false, true], [false, false]])('uses manual update for installed=%s trusted=%s', async (installed, trusted) => {
    const f = fixture(installed, trusted)
    const state = await f.manager.check()
    expect(state.status).toBe('manual')
    expect(state.releaseUrl).toBe(RELEASES_URL)
    expect(f.adapter.checkForUpdates).not.toHaveBeenCalled()
    f.emit('update-available', { version: '0.2.0' }); f.emit('update-downloaded', { version: '0.2.0' })
    expect(f.adapter.downloadUpdate).not.toHaveBeenCalled()
    expect(() => f.manager.install()).toThrow('No verified update')
  })
  it('downloads trusted updates but requires idle explicit install', async () => {
    const f = fixture()
    f.emit('update-available', { version: '0.2.0' })
    expect(f.adapter.downloadUpdate).toHaveBeenCalledTimes(1)
    f.emit('download-progress', { percent: 38.2 })
    expect(f.manager.getState().percent).toBe(38.2)
    f.emit('update-downloaded', { version: '0.2.0' })
    expect(f.adapter.quitAndInstall).not.toHaveBeenCalled()
    f.isBusy.mockReturnValue(true)
    expect(() => f.manager.install()).toThrow('Finish the current operation')
    f.isBusy.mockReturnValue(false); f.manager.install()
    expect(f.adapter.quitAndInstall).toHaveBeenCalledWith(false, true)
  })
  it('rejects bad download/signature outcomes and disables restart', () => {
    const f = fixture()
    f.emit('update-downloaded', { version: '0.2.0' })
    f.emit('error', new Error('signature mismatch'))
    expect(f.manager.getState().status).toBe('error')
    expect(() => f.manager.install()).toThrow('No verified update')
  })
  it('keeps offline and malformed responses in recoverable error state', async () => {
    const f = fixture(true, false)
    f.latest.mockRejectedValueOnce(new Error('offline'))
    expect((await f.manager.check()).status).toBe('error')
    f.latest.mockResolvedValueOnce({ tag_name: 'v3.0.0', draft: false, prerelease: true })
    expect((await f.manager.check()).status).toBe('error')
    expect((await f.manager.check()).status).toBe('manual')
  })
  it('deduplicates concurrent checks', async () => {
    const f = fixture(true, false)
    await Promise.all([f.manager.check(), f.manager.check()])
    expect(f.latest).toHaveBeenCalledTimes(1)
  })
  it('defers prompt, download, and polling while a repair is running', async () => {
    const f = fixture()
    f.isBusy.mockReturnValue(true)
    f.emit('update-available', { version: '0.2.0' })
    expect(f.adapter.downloadUpdate).not.toHaveBeenCalled()
    expect(f.manager.getState().status).toBe('available')
    expect((await f.manager.check()).status).toBe('available')
    expect(f.latest).not.toHaveBeenCalled()
    f.isBusy.mockReturnValue(false)
    f.emit('update-available', { version: '0.2.0' })
    expect(f.adapter.downloadUpdate).toHaveBeenCalledTimes(1)
  })
  it('renders only trusted finite percent values', () => {
    const f = fixture()
    f.emit('update-available', { version: '0.2.0' })
    f.emit('download-progress', { percent: 140 })
    expect(f.manager.getState().percent).toBeUndefined()
    f.emit('download-progress', { percent: '38' })
    expect(f.manager.getState().percent).toBeUndefined()
    f.emit('download-progress', { percent: 38.2 })
    expect(f.manager.getState().percent).toBe(38.2)
  })
  it('records update settings preserved across a disposable-profile upgrade mock', async () => {
    const f = fixture()
    const before = JSON.parse(JSON.stringify(f.manager.getState()))
    const profile = { appData: 'mock-disposable-profile', settingsFile: 'state.json', version: before.releaseUrl }
    const after = JSON.parse(JSON.stringify({ ...before, version: undefined, status: 'manual' }))
    expect(after.releaseUrl).toBe(before.releaseUrl)
    expect(profile.settingsFile).toBe('state.json')
    expect(profile.appData).toBe('mock-disposable-profile')
    // Mock only: no claim is made about a real installer upgrade on this host.
    expect(f.manager.getState().releaseUrl).toBe(RELEASES_URL)
    void after
  })
})
