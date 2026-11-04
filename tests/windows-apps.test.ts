import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AppTarget, RepairStep } from '../src/shared/contracts'
import { LabGuard } from '../src/main/windows/lab'
import { AppRepairs } from '../src/main/windows/apps'
import { setProcessRunner, resetProcessRunner } from '../src/main/windows/native'

function makeLab() {
  const labRoot = LabGuard.tempLab('pb-apps-')
  const lab = new LabGuard(labRoot)
  expect(lab.labMode).toBe(true)
  return { labRoot, lab }
}

function appFor(family: 'firefox' | 'obsidian' | 'steam', id = `${family}-lab`): AppTarget {
  return { id, name: `${family} lab`, version: '1.0', publisher: 'lab', family, capabilities: [] }
}

function stepFor(app: AppTarget, operation: RepairStep['operation'], params: RepairStep['params']): RepairStep {
  return {
    id: `step-${operation}`, operation, title: operation, targetId: app.id,
    params, requiresAdmin: false, reversible: true, impact: '', verification: '',
  }
}

function seedFirefox(labRoot: string, prefs = 'user_pref("network.proxy.type", 1);\n') {
  const root = join(labRoot, 'apps', 'firefox')
  const profile = join(root, 'profile.default')
  mkdirSync(profile, { recursive: true })
  const prefsFile = join(profile, 'prefs.js')
  writeFileSync(prefsFile, prefs, 'utf8')
  return { root, profile, prefsFile }
}

function seedObsidian(labRoot: string, appearance: string = '{"cssTheme":"Broken","theme":"dark"}') {
  const root = join(labRoot, 'apps', 'obsidian')
  const vault = join(root, 'vault')
  mkdirSync(join(vault, '.obsidian'), { recursive: true })
  const file = join(vault, '.obsidian', 'appearance.json')
  writeFileSync(file, appearance, 'utf8')
  return { root, vault, file }
}

function repairsFor(lab: LabGuard, apps: AppTarget[]) {
  const byId = new Map(apps.map((a) => [a.id, a]))
  const repairs = new AppRepairs(join(lab.assertLab('t'), '.data'), lab, async (id) => {
    const found = byId.get(id)
    if (!found) throw new Error('Application is no longer installed.')
    return found
  })
  return repairs
}

let dirs: string[] = []
function track(dir: string) { dirs.push(dir); return dir }
beforeEach(() => { dirs = [] })
afterEach(() => { resetProcessRunner(); for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }) } catch {} } })

describe('Firefox prefs repair + byte-for-byte undo', () => {
  it('repairs prefs.js and restores exact bytes on undo', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    const before = '# comment\nuser_pref("network.proxy.type", 1);\nuser_pref("browser.startup.homepage", "x");\n'
    const { prefsFile } = seedFirefox(labRoot, before)
    const app = appFor('firefox')
    const repairs = repairsFor(lab, [app])
    const step = stepFor(app, 'app.patchConfig', { appId: app.id, setting: 'network.proxy.type', value: 0 })
    expect(repairs.capabilities(app)).toContain('app.patchConfig')
    const exec = await repairs.execute(step)
    expect(exec.success).toBe(true)
    const after = readFileSync(prefsFile, 'utf8')
    expect(after).toContain('user_pref("network.proxy.type", 0);')
    expect(after).toContain('browser.startup.homepage')
    const verify = await repairs.verify(step, exec)
    expect(verify.passed).toBe(true)
    const undone = await repairs.undo(exec)
    expect(undone.passed).toBe(true)
    expect(readFileSync(prefsFile, 'utf8')).toBe(before)
  })

  it('prefers user.js override when it pins the proxy', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    const { profile } = seedFirefox(labRoot, 'user_pref("network.proxy.type", 1);\n')
    writeFileSync(join(profile, 'user.js'), 'user_pref("network.proxy.type", 1);\n', 'utf8')
    const app = appFor('firefox')
    const repairs = repairsFor(lab, [app])
    const step = stepFor(app, 'app.patchConfig', { appId: app.id, setting: 'network.proxy.type', value: 0 })
    const exec = await repairs.execute(step)
    expect(exec.success).toBe(true)
    expect(String(exec.data.file)).toBe(join(profile, 'user.js'))
    expect(readFileSync(join(profile, 'user.js'), 'utf8')).toContain('user_pref("network.proxy.type", 0);')
  })

  it('preserves cookies/history/logins during patch', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    const { profile } = seedFirefox(labRoot)
    for (const f of ['cookies.sqlite', 'places.sqlite', 'logins.json']) writeFileSync(join(profile, f), 'sentinel-' + f, 'utf8')
    const app = appFor('firefox')
    const repairs = repairsFor(lab, [app])
    const step = stepFor(app, 'app.patchConfig', { appId: app.id, setting: 'network.proxy.type', value: 0 })
    const exec = await repairs.execute(step)
    expect(exec.success).toBe(true)
    for (const f of ['cookies.sqlite', 'places.sqlite', 'logins.json']) expect(readFileSync(join(profile, f), 'utf8')).toBe('sentinel-' + f)
  })

  it('refuses undo after newer user edits', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    seedFirefox(labRoot)
    const app = appFor('firefox')
    const repairs = repairsFor(lab, [app])
    const step = stepFor(app, 'app.patchConfig', { appId: app.id, setting: 'network.proxy.type', value: 0 })
    const exec = await repairs.execute(step)
    expect(exec.success).toBe(true)
    appendFileSync(String(exec.data.file), '// newer user edit\n', 'utf8')
    const undone = await repairs.undo(exec)
    expect(undone.passed).toBe(false)
    expect(undone.summary).toMatch(/newer edits/i)
  })
})

describe('Obsidian cssTheme reset + byte-for-byte undo', () => {
  it('resets cssTheme and restores exact bytes', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    const beforeObj = { cssTheme: 'Broken-Theme 1', theme: 'dark', extra: true }
    const before = JSON.stringify(beforeObj) // compact on purpose: undo must restore bytes
    const seeded = seedObsidian(labRoot, before)
    const app = appFor('obsidian')
    const repairs = repairsFor(lab, [app])
    expect(repairs.capabilities(app)).toContain('app.patchConfig')
    const step = stepFor(app, 'app.patchConfig', { appId: app.id, setting: 'cssTheme', value: '' })
    const exec = await repairs.execute(step)
    expect(exec.success).toBe(true)
    expect(JSON.parse(readFileSync(seeded.file, 'utf8')).cssTheme).toBe('')
    expect(JSON.parse(readFileSync(seeded.file, 'utf8')).theme).toBe('dark')
    const undone = await repairs.undo(exec)
    expect(undone.passed).toBe(true)
    expect(readFileSync(seeded.file, 'utf8')).toBe(before)
    // Real byte-for-byte check: backup file hash equals restored file.
    const backup = lab.readBackup(exec.backupId!)
    const backupText = readFileSync(String((backup.data as Record<string, string>).backupFile), 'utf8')
    expect(readFileSync(seeded.file, 'utf8')).toBe(backupText)
  })

  it('preserves vault documents during reset', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    const seeded = seedObsidian(labRoot)
    writeFileSync(join(seeded.vault, 'notes.md'), '# keep me', 'utf8')
    const app = appFor('obsidian')
    const repairs = repairsFor(lab, [app])
    const step = stepFor(app, 'app.patchConfig', { appId: app.id, setting: 'cssTheme', value: '' })
    expect((await repairs.execute(step)).success).toBe(true)
    expect(readFileSync(join(seeded.vault, 'notes.md'), 'utf8')).toBe('# keep me')
  })

  it('rejects unsupported obsidian settings', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    seedObsidian(labRoot)
    const app = appFor('obsidian')
    const repairs = repairsFor(lab, [app])
    const step = stepFor(app, 'app.patchConfig', { appId: app.id, setting: 'theme', value: 'dark' })
    const exec = await repairs.execute(step)
    expect(exec.success).toBe(false)
    expect(exec.output).toMatch(/Only resetting the custom Obsidian theme/i)
  })
})

describe('cache quarantine + restore', () => {
  it('quarantines firefox caches, preserves user data, restores on undo', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    const { profile } = seedFirefox(labRoot)
    const cache = join(labRoot, 'apps', 'firefox', 'cache2')
    mkdirSync(cache, { recursive: true })
    writeFileSync(join(cache, 'data.bin'), 'cache-bytes', 'utf8')
    writeFileSync(join(profile, 'cookies.sqlite'), 'keep-cookies', 'utf8')
    writeFileSync(join(profile, 'places.sqlite'), 'keep-history', 'utf8')
    writeFileSync(join(profile, 'logins.json'), 'keep-logins', 'utf8')
    const app = appFor('firefox')
    const repairs = repairsFor(lab, [app])
    expect(repairs.capabilities(app)).toContain('app.quarantineCache')
    const step = stepFor(app, 'app.quarantineCache', { appId: app.id })
    const exec = await repairs.execute(step)
    expect(exec.success).toBe(true)
    expect(existsSync(cache)).toBe(false)
    expect(readFileSync(join(profile, 'cookies.sqlite'), 'utf8')).toBe('keep-cookies')
    const verify = await repairs.verify(step, exec)
    expect(verify.passed).toBe(true)
    const undone = await repairs.undo(exec)
    expect(undone.passed).toBe(true)
    expect(existsSync(cache)).toBe(true)
    expect(readFileSync(join(cache, 'data.bin'), 'utf8')).toBe('cache-bytes')
  })

  it('refuses quarantine when an executable hides in cache', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    seedFirefox(labRoot)
    const cache = join(labRoot, 'apps', 'firefox', 'cache2')
    mkdirSync(cache, { recursive: true })
    writeFileSync(join(cache, 'evil.exe'), 'MZ', 'utf8')
    const app = appFor('firefox')
    const repairs = repairsFor(lab, [app])
    const exec = await repairs.execute(stepFor(app, 'app.quarantineCache', { appId: app.id }))
    expect(exec.success).toBe(false)
    expect(exec.output).toMatch(/executable/i)
    expect(existsSync(cache)).toBe(true)
  })

  it('refuses undo after the app recreated its cache', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    seedFirefox(labRoot)
    const cache = join(labRoot, 'apps', 'firefox', 'cache2')
    mkdirSync(cache, { recursive: true })
    writeFileSync(join(cache, 'a.tmp'), 'a', 'utf8')
    const app = appFor('firefox')
    const repairs = repairsFor(lab, [app])
    const step = stepFor(app, 'app.quarantineCache', { appId: app.id })
    const exec = await repairs.execute(step)
    expect(exec.success).toBe(true)
    mkdirSync(cache, { recursive: true })
    writeFileSync(join(cache, 'fresh.tmp'), 'fresh', 'utf8')
    expect((await repairs.verify(step,exec)).passed).toBe(true)
    const undone = await repairs.undo(exec)
    expect(undone.passed).toBe(false)
    expect(undone.summary).toMatch(/new cache/i)
  })

  it('withholds success when the setting changed but a required relaunch failed',async()=>{
    const root=track(mkdtempSync(join(tmpdir(),'pb-relaunch-'))),file=join(root,'prefs.js')
    writeFileSync(file,'user_pref("network.proxy.type", 0);\n')
    const app=appFor('firefox'),lab=new LabGuard(undefined,join(root,'data'))
    const repairs=new AppRepairs(join(root,'data'),lab,async()=>app)
    setProcessRunner(async()=>({exitCode:0,stdout:'{"found":0,"remaining":0}',stderr:''}))
    const step=stepFor(app,'app.patchConfig',{appId:app.id,setting:'network.proxy.type',value:0})
    const verified=await repairs.verify(step,{step,startedAt:'',finishedAt:'',success:true,output:'',data:{file,root,value:0,relaunchExpected:true,exe:join(root,'firefox.exe')}})
    expect(verified.passed).toBe(false)
    expect(verified.checks.find(check=>check.name==='Setting verified')?.passed).toBe(true)
    expect(verified.checks.find(check=>check.name==='App is running again')?.passed).toBe(false)
  })
})

describe('LabGuard confinement for apps', () => {
  it('rejects path traversal out of the lab root', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    seedFirefox(labRoot)
    const app = appFor('firefox')
    const repairs = repairsFor(lab, [app])
    // Traversal via cache dir name is blocked during confine/roots inspection.
    expect(() => lab.confine(join(labRoot, '..', 'escape'), labRoot, 'Application data')).toThrow(/escapes/i)
    // execute itself stays green on the valid fixture (proves lab is wired, not bypassed).
    const exec = await repairs.execute(stepFor(app, 'app.patchConfig', { appId: app.id, setting: 'network.proxy.type', value: 0 }))
    expect(exec.success).toBe(true)
  })

  it('rejects symlink/junction inside lab app tree', () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    const { profile } = seedFirefox(labRoot)
    const link = join(profile, 'startupCache')
    try {
      symlinkSync(labRoot, link, 'junction')
    } catch {
      // Windows may need privileges; fall back to asserting confine rejects links directly.
    }
    expect(() => lab.assertNotLink(link, 'Application data')).toThrow()
  })

  it('lab roots exclude a fake host install root', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    const hostRoot = mkdtempSync(join(tmpdir(), 'pb-host-')); track(hostRoot)
    mkdirSync(join(hostRoot, 'cache2'), { recursive: true })
    writeFileSync(join(hostRoot, 'cache2', 'host.bin'), 'host', 'utf8')
    seedFirefox(labRoot) // lab fixture only
    const app: AppTarget = { ...appFor('firefox'), installLocation: hostRoot, executable: join(hostRoot, 'firefox.exe') }
    const repairs = repairsFor(lab, [app])
    // In lab mode roots() only scans <labRoot>/apps/<family>; host installLocation is ignored.
    expect(repairs.capabilities(app)).not.toContain('app.quarantineCache')
  })

  it('creates no fixtures during capabilities/diagnostics', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    seedFirefox(labRoot)
    const app = appFor('firefox')
    const repairs = repairsFor(lab, [app])
    const snap = (d: string): string[] => readdirSync(d, { recursive: true } as unknown as object) as unknown as string[]
    const before = snap(labRoot).sort()
    repairs.capabilities(app)
    repairs.diagnostics(app)
    repairs.constraints(app, 'app.patchConfig')
    expect(snap(labRoot).sort()).toEqual(before)
  })
})

describe('param validation, retargeting, refusal paths', () => {
  it('rejects retargeted appIds (targetId vs params.appId vs live app)', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    seedFirefox(labRoot)
    const app = appFor('firefox')
    const other = appFor('firefox', 'firefox-other')
    const repairs = repairsFor(lab, [app, other])
    const mismatch = stepFor(app, 'app.patchConfig', { appId: other.id, setting: 'network.proxy.type', value: 0 })
    const r1 = await repairs.execute(mismatch)
    expect(r1.success).toBe(false)
    expect(r1.output).toMatch(/do not match/i)
    const wrongTarget = { ...stepFor(app, 'app.patchConfig', { appId: app.id, setting: 'network.proxy.type', value: 0 }), targetId: other.id }
    const r2 = await repairs.execute(wrongTarget)
    expect(r2.success).toBe(false)
  })

  it('rejects unsupported firefox settings/values and extra params', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    seedFirefox(labRoot)
    const app = appFor('firefox')
    const repairs = repairsFor(lab, [app])
    const badSetting = await repairs.execute(stepFor(app, 'app.patchConfig', { appId: app.id, setting: 'browser.startup.homepage', value: 'x' }))
    expect(badSetting.success).toBe(false)
    expect(badSetting.output).toMatch(/Only clearing the manual Firefox proxy/i)
    const badValue = await repairs.execute(stepFor(app, 'app.patchConfig', { appId: app.id, setting: 'network.proxy.type', value: 1 }))
    expect(badValue.success).toBe(false)
    const extra = await repairs.execute(stepFor(app, 'app.patchConfig', { appId: app.id, setting: 'network.proxy.type', value: 0, evil: 1 }))
    expect(extra.success).toBe(false)
    expect(extra.output).toMatch(/Unsupported application repair parameter/i)
  })

  it('validate() re-checks against the live snapshot', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    seedFirefox(labRoot)
    const app = appFor('firefox')
    const repairs = repairsFor(lab, [app])
    const step = stepFor(app, 'app.patchConfig', { appId: app.id, setting: 'network.proxy.type', value: 0 })
    const snapshot = { apps: [app] } as unknown as import('../src/shared/contracts').SystemSnapshot
    expect(() => repairs.validate(step, snapshot)).not.toThrow()
    expect(() => repairs.validate(step, { apps: [] } as unknown as import('../src/shared/contracts').SystemSnapshot)).toThrow(/no longer installed/i)
  })

  it('steam exposes no patchConfig; package update is not simulated in lab', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    const steam: AppTarget = { ...appFor('steam'), packageId: 'Valve.Steam' }
    const repairs = repairsFor(lab, [steam])
    expect(repairs.capabilities(steam)).not.toContain('app.patchConfig')
    expect(repairs.capabilities(steam)).toContain('app.updatePackage')
    const exec = await repairs.execute(stepFor(steam, 'app.updatePackage', { appId: steam.id, packageId: 'Valve.Steam' }))
    expect(exec.success).toBe(false)
    expect(exec.output).toMatch(/not simulated/i)
  })

  it('restart in lab mode touches no host processes', async () => {
    const { labRoot, lab } = makeLab(); track(labRoot)
    seedFirefox(labRoot)
    const app = appFor('firefox')
    const repairs = repairsFor(lab, [app])
    expect(repairs.capabilities(app)).toContain('app.restart')
    const step = stepFor(app, 'app.restart', { appId: app.id })
    const exec = await repairs.execute(step)
    expect(exec.success).toBe(true)
    const verify = await repairs.verify(step, exec)
    expect(verify.passed).toBe(true)
    expect(verify.summary).toMatch(/no host process/i)
    seedObsidian(labRoot, '{"cssTheme":"Broken-Theme","theme":"dark"}')
    const obsidian = appFor('obsidian')
    const steam: AppTarget = { ...appFor('steam'), packageId: 'Valve.Steam' }
    const allRepairs = repairsFor(lab, [app, obsidian, steam])
    const snap = { scannedAt: 'now', platform: 'win32', machine: { name: 't', os: 'w', memoryTotal: 1, memoryFree: 1, uptime: 1, cpuCount: 1 }, metrics: { diskFree: 1, diskTotal: 1, cpuPercent: null }, diagnostics: [], apps: [app, obsidian, steam], startup: [], services: [], labMode: true }
    expect(await allRepairs.previewStep(stepFor(app, 'app.patchConfig', { appId: app.id, setting: 'network.proxy.type', value: 0 }), snap)).toEqual({
      resource: 'firefox lab: network.proxy.type',
      before: '1 (manual proxy enabled)',
      after: '0 (manual proxy disabled)',
    })
    expect(await allRepairs.previewStep(stepFor(obsidian, 'app.patchConfig', { appId: obsidian.id, setting: 'cssTheme', value: '' }), snap)).toEqual({
      resource: 'obsidian lab: cssTheme',
      before: 'Broken-Theme',
      after: '(default / none)',
    })
    expect(await allRepairs.previewStep(stepFor(steam, 'app.updatePackage', { appId: steam.id, packageId: 'Valve.Steam' }), snap)).toEqual({
      resource: 'steam lab: Valve.Steam',
      before: 'Version 1.0',
      after: 'Update to exact WinGet package; installed version verified afterward',
    })
  })
})
