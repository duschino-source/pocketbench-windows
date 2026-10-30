import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  elevatedOperation,
  resolveScriptPath,
  runScript,
  resetProcessRunner,
  setProcessRunner,
  stripBom,
  userOperation,
} from '../src/main/windows/native'

// Read-only probes safe on developer hosts: parsing/validation only, plus real
// non-mutating reads (script headers, version query, read-only file stat).
describe('windows native worker (no host mutations)', () => {
  beforeEach(() => {
    resetProcessRunner()
  })
  afterEach(() => {
    resetProcessRunner()
    vi.unstubAllEnvs()
  })

  it('rejects unknown scripts and unknown operations without spawning', async () => {
    const spawned: string[][] = []
    setProcessRunner(async () => {
      spawned.push([])
      return { exitCode: 0, stdout: '{}', stderr: '' }
    })
    await expect(runScript('evil.ps1' as never)).rejects.toThrow()
    await expect(userOperation('formatDrive')).rejects.toThrow()
    expect(spawned).toHaveLength(0)
  })

  it('requires operation-scoped fixed arguments and a full-path executable', async () => {
    setProcessRunner(async () => ({ exitCode: 0, stdout: '{}', stderr: '' }))
    await expect(userOperation('disableStartup', {})).rejects.toThrow(/Name/)
    await expect(userOperation('checkProcess', { ExpectedExe: 'firefox.exe' })).rejects.toThrow(/absolute/)
    await expect(userOperation('checkProcess', { ExpectedExe: 'C:\\evil\\tool.exe' })).rejects.toThrow(/firefox|steam|obsidian/)
    await expect(userOperation('checkService', { ServiceName: 'Spooler' })).rejects.toThrow(/service/i)
    await expect(userOperation('restoreProxy', { StateBase64: '!!!' })).rejects.toThrow()
  })

  it('invokes powershell with -File and no shell text', async () => {
    const calls: { exe: string; args: string[] }[] = []
    setProcessRunner(async (exe, args) => {
      calls.push({ exe, args })
      return { exitCode: 0, stdout: '{"healthy":true,"pendingReboot":false,"summary":"ok"}', stderr: '' }
    })
    const result = await userOperation('checkHealth')
    expect(result).toEqual({ healthy: true, pendingReboot: false, summary: 'ok' })
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toContain('-File')
    expect(calls[0].args.join(' ')).not.toMatch(/-Command|-EncodedCommand|Invoke-Expression/)
  })

  it('strips BOM on JSON receipts and surfaces script failure text', async () => {
    setProcessRunner(async () => ({ exitCode: 0, stdout: '﻿{"count":3}', stderr: '' }))
    await expect(userOperation('getDnsCache')).resolves.toEqual({ count: 3 })
    setProcessRunner(async () => ({ exitCode: 1, stdout: '', stderr: 'boom' }))
    await expect(userOperation('getDnsCache')).rejects.toThrow(/boom/)
    expect(stripBom('﻿x')).toBe('x')
  })

  it('treats a missing elevation receipt as declined, not success', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-elev-'))
    const calls: string[][] = []
    setProcessRunner(async (_exe, args) => {
      calls.push(args)
      return { exitCode: 1223, stdout: '', stderr: 'cancelled by user' }
    })
    const result = await elevatedOperation('flushDns', dir)
    expect(result.success).toBe(false)
    expect(result.exitCode).toBe(1223)
    expect(result.output).toMatch(/no receipt/i)
    expect(calls[0].join(' ')).toContain('request-elevation.ps1')
    expect(calls[0].join(' ')).toContain('receipt-')
  })

  it('reads a mocked elevation receipt instead of inferring success', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-elev-ok-'))
    const receiptDir = join(dir, 'elevated')
    mkdirSync(receiptDir, { recursive: true })
    const receipt = join(receiptDir, 'receipt-test.json')
    writeFileSync(receipt, '﻿{"success":true,"output":"ok","exitCode":0,"pendingReboot":false}')
    // Point the generated unique receipt name at the fixture: intercept spawn,
    // write the same payload to the requested path, then report launcher success.
    const { readFileSync, writeFileSync: write } = await import('node:fs')
    setProcessRunner(async (_exe, args) => {
      const index = args.indexOf('-Receipt')
      const target = args[index + 1]
      write(target, readFileSync(receipt, 'utf8'))
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    const result = await elevatedOperation('flushDns', dir)
    expect(result).toMatchObject({ success: true, exitCode: 0, pendingReboot: false })
  })

  it('resolves scripts via POCKETBENCH_RESOURCES when set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-res-'))
    mkdirSync(join(dir, 'windows'), { recursive: true })
    writeFileSync(join(dir, 'windows', 'user.ps1'), 'param()')
    vi.stubEnv('POCKETBENCH_RESOURCES', dir)
    expect(resolveScriptPath('user.ps1')).toBe(join(dir, 'windows', 'user.ps1'))
  })

  it('keeps param() as the first statement in every worker script', async () => {
    const { readFileSync } = await import('node:fs')
    for (const name of ['user.ps1', 'elevate.ps1', 'request-elevation.ps1']) {
      const text = readFileSync(join(process.cwd(), 'resources', 'windows', name), 'utf8')
      const first = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))[0]
      expect(first, name).toMatch(/^param\s*\(/)
    }
  })

  it('validates worker PowerShell parsing (Windows PowerShell when present)', async () => {
    const { execFile } = await import('node:child_process')
    const run = (args: string[]): Promise<{ code: number; out: string; err: string }> =>
      new Promise((done) => {
        execFile(
          'powershell.exe',
          args,
          { windowsHide: true, timeout: 30000 },
          (error, stdout, stderr) => {
            const code = error && typeof (error as { code?: number }).code === 'number'
              ? (error as { code: number }).code
              : 0
            done({ code, out: String(stdout), err: String(stderr) })
          },
        )
      })
    let available = true
    try {
      await run(['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'])
    } catch {
      available = false
    }
    if (!available) return
    for (const name of ['user.ps1', 'elevate.ps1', 'request-elevation.ps1']) {
      const full = join(process.cwd(), 'resources', 'windows', name)
      const parsed = await run([
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `[void][System.Management.Automation.Language.Parser]::ParseFile('${full}',$null,[ref]$null); 'parse-ok'`,
      ])
      expect(parsed.out, name + parsed.err).toContain('parse-ok')
      const badVerb = await run([
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Select-String -Path '${full}' -Pattern 'Invoke-Expression|Stop-Process|Set-ExecutionPolicy|Remove-Item[^\\r\\n]*\\*' | Measure-Object | Select-Object -ExpandProperty Count`,
      ])
      expect(Number(badVerb.out.trim())).toBe(0)
    }
    // Read-only checks only: policy read path exists, health keys readable; no writes performed.
    const policy = await run([
      '-NoProfile',
      '-NonInteractive',
      '-File',
      join(process.cwd(), 'resources', 'windows', 'user.ps1'),
      '-Operation',
      'proxyPolicy',
    ])
    expect(policy.code).toBe(0)
    expect(JSON.parse(stripBom(policy.out))).toHaveProperty('pinned')
  }, 30000)

  it('never reports healthy OS merely from absent reboot indicators', async () => {
    const { readFileSync } = await import('node:fs')
    const text = readFileSync(join(process.cwd(), 'resources', 'windows', 'user.ps1'), 'utf8')
    expect(text).not.toMatch(/\$healthy\s*=\s*-not\s*\$pending/)
    expect(text).toMatch(/\$healthy\s*=\s*\$false/)
    expect(text).toMatch(/No independent integrity check available/)
  })

  it('fails closed on process ownership check errors', async () => {
    const { readFileSync } = await import('node:fs')
    const text = readFileSync(join(process.cwd(), 'resources', 'windows', 'user.ps1'), 'utf8')
    expect(text).not.toMatch(/if\s*\(\$ownerSid\s*-and/)
    expect(text).toMatch(/Unable to verify process ownership/)
  })
})
