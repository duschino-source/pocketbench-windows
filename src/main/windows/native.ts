import { spawn } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join, resolve, sep } from 'node:path'

export const SCRIPT_NAMES = ['scan.ps1', 'user.ps1'] as const
export type ScriptName = (typeof SCRIPT_NAMES)[number]

export const USER_OPERATIONS = [
  'getProxy',
  'clearProxy',
  'restoreProxy',
  'proxyPolicy',
  'getStartup',
  'disableStartup',
  'restoreStartup',
  'requestClose',
  'checkService',
  'checkProcess',
  'checkHealth',
  'getDnsCache',
] as const
export type UserOperation = (typeof USER_OPERATIONS)[number]

export const ELEVATED_OPERATIONS = ['flushDns', 'startService', 'integrityRepair'] as const
export type ElevatedOperation = (typeof ELEVATED_OPERATIONS)[number]

export const SELECTED_SERVICES = ['Dnscache', 'Dhcp', 'NlaSvc', 'W32Time', 'BITS', 'wuauserv', 'Winmgmt'] as const

export const RESTART_EXE_BASENAMES = ['firefox.exe', 'steam.exe', 'obsidian.exe'] as const

export interface ElevatedResult {
  success: boolean
  output: string
  exitCode: number
  pendingReboot: boolean
  data?: Record<string, unknown>
}

export interface ProcessResult {
  exitCode: number
  stdout: string
  stderr: string
}

export type ProcessRunner = (exe: string, args: string[], timeoutMs: number) => Promise<ProcessResult>

const ARG_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,31}$/
const MAX_ARG_VALUE_LENGTH = 8192

function defaultRunner(exe: string, args: string[], timeoutMs: number): Promise<ProcessResult> {
  return new Promise((finished) => {
    const child = spawn(exe, args, { windowsHide: true, shell: false, timeout: timeoutMs })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      finished({ exitCode: 127, stdout, stderr: stderr + String(error?.message ?? error) })
    })
    child.on('close', (code) => {
      finished({ exitCode: typeof code === 'number' ? code : 127, stdout, stderr })
    })
  })
}

let runner: ProcessRunner = defaultRunner

/** Test hook: replace process spawning with a mock. Tests must restore via resetProcessRunner(). */
export function setProcessRunner(next: ProcessRunner): void {
  runner = next
}

export function resetProcessRunner(): void {
  runner = defaultRunner
}

export function powershellExe(): string {
  return process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
}

/** Resolve a fixed script file. POCKETBENCH_RESOURCES (unpacked layout) wins, else repo resources. */
export function resolveScriptPath(name: ScriptName): string {
  const fromEnv = process.env.POCKETBENCH_RESOURCES
  const candidates = fromEnv ? [join(fromEnv, 'windows', name)] : []
  candidates.push(join(process.cwd(), 'resources', 'windows', name))
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  // Last resort: return the preferred location even if missing so errors name the file.
  return candidates[0] ?? join(process.cwd(), 'resources', 'windows', name)
}

/** Elevated helper scripts live next to user.ps1 but are never run through runScript(). */
export function resolveElevatedScriptPath(name: 'elevate.ps1' | 'request-elevation.ps1'): string {
  const base = resolveScriptPath('user.ps1')
  const dir = base.slice(0, base.length - 'user.ps1'.length)
  return join(dir, name)
}

export function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1)
  return text
}

export function parseJsonOutput<T>(stdout: string): T {
  const cleaned = stripBom(stdout).trim()
  if (!cleaned) throw new Error('Script produced no output.')
  return JSON.parse(cleaned) as T
}

function assertValidArgs(args: Record<string, string>): void {
  for (const [key, value] of Object.entries(args)) {
    if (!ARG_NAME_PATTERN.test(key)) throw new Error(`Invalid argument name: ${key}`)
    if (typeof value !== 'string') throw new Error(`Invalid argument value for: ${key}`)
    if (value.length > MAX_ARG_VALUE_LENGTH) throw new Error(`Argument too long: ${key}`)
    if (value.includes('\0')) throw new Error(`Invalid argument value for: ${key}`)
  }
}

function toArgv(scriptPath: string, args: Record<string, string>): string[] {
  const argv = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]
  for (const [key, value] of Object.entries(args)) {
    argv.push(`-${key}`, value)
  }
  return argv
}

export async function runScript<T = unknown>(
  name: ScriptName,
  args: Record<string, string> = {},
  timeoutMs = 60000,
): Promise<T> {
  if (!(SCRIPT_NAMES as readonly string[]).includes(name)) {
    throw new Error(`Refusing to run unknown script: ${name}`)
  }
  assertValidArgs(args)
  const scriptPath = resolveScriptPath(name)
  const result = await runner(powershellExe(), toArgv(scriptPath, args), timeoutMs)
  if (result.exitCode !== 0) {
    const detail = stripBom(result.stderr || result.stdout).trim().slice(0, 2000)
    throw new Error(`Script ${name} failed (exit ${result.exitCode}): ${detail}`)
  }
  return parseJsonOutput<T>(result.stdout)
}

function assertExpectedExe(value: string): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    throw new Error('ExpectedExe must be a non-empty absolute path.')
  }
  if (value.includes('\0') || value.includes('\n') || value.includes('\r') || value.includes('"')) {
    throw new Error('Invalid ExpectedExe value.')
  }
  const lower = value.toLowerCase()
  const ok = RESTART_EXE_BASENAMES.some((base) => lower === base || lower.endsWith(`\\${base}`) || lower.endsWith(`/${base}`))
  if (!ok) throw new Error('ExpectedExe must be the full path to firefox.exe, steam.exe, or obsidian.exe.')
  if (!/^(?:[A-Za-z]:[\\/]|\\\\)/.test(value)) throw new Error('ExpectedExe must be an absolute path.')
}

const USER_ARG_REQUIREMENTS: Record<UserOperation, string[]> = {
  getProxy: [],
  clearProxy: [],
  restoreProxy: ['StateBase64'],
  proxyPolicy: [],
  getStartup: [],
  disableStartup: ['Name'],
  restoreStartup: ['StateBase64'],
  requestClose: ['ExpectedExe'],
  checkService: ['ServiceName'],
  checkProcess: ['ExpectedExe'],
  checkHealth: [],
  getDnsCache: [],
}

export async function userOperation<T = unknown>(
  operation: string,
  args: Record<string, string> = {},
  timeoutMs = 60000,
): Promise<T> {
  if (!(USER_OPERATIONS as readonly string[]).includes(operation)) {
    throw new Error(`Unsupported user operation: ${operation}`)
  }
  const op = operation as UserOperation
  const required = USER_ARG_REQUIREMENTS[op]
  const allowed = new Set(['Operation', ...required])
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) throw new Error(`Unexpected argument for ${op}: ${key}`)
  }
  for (const key of required) {
    if (typeof args[key] !== 'string' || args[key].length === 0) {
      throw new Error(`Missing required argument for ${op}: ${key}`)
    }
  }
  if (args.Name !== undefined && (args.Name.length > 128 || /[\\/:*?"<>|]/.test(args.Name))) {
    throw new Error('Invalid startup entry name.')
  }
  if (args.ServiceName !== undefined && !(SELECTED_SERVICES as readonly string[]).includes(args.ServiceName)) {
    throw new Error('Unsupported service name.')
  }
  if (args.ExpectedExe !== undefined) assertExpectedExe(args.ExpectedExe)
  if (args.StateBase64 !== undefined) {
    if (args.StateBase64.length > 8192 || !/^[A-Za-z0-9+/=]+$/.test(args.StateBase64)) {
      throw new Error('Invalid StateBase64 value.')
    }
  }
  return runScript<T>('user.ps1', { Operation: op, ...args }, timeoutMs)
}

function ensureReceiptPath(dataDirectory: string): string {
  if (typeof dataDirectory !== 'string' || dataDirectory.length === 0 || dataDirectory.length > 512) {
    throw new Error('Invalid data directory.')
  }
  if (dataDirectory.includes('\0') || dataDirectory.includes('\n') || dataDirectory.includes('\r')) {
    throw new Error('Invalid data directory.')
  }
  const dir = resolve(join(dataDirectory, 'elevated'))
  mkdirSync(dir, { recursive: true })
  const parentStat = lstatSync(dir)
  if (parentStat.isSymbolicLink()) throw new Error('Refusing receipt inside a linked directory.')
  const receipt = join(dir, `receipt-${Date.now().toString(36)}-${randomBytes(8).toString('hex')}.json`)
  if (!receipt.startsWith(dir + sep)) throw new Error('Unexpected receipt location.')
  if (existsSync(receipt)) throw new Error('Receipt already exists; refusing overwrite.')
  return receipt
}

function normalizeElevatedReceipt(raw: unknown): ElevatedResult {
  if (typeof raw !== 'object' || raw === null) throw new Error('Elevated receipt has an unexpected shape.')
  const record = raw as Record<string, unknown>
  return {
    success: record.success === true,
    output: typeof record.output === 'string' ? record.output : '',
    exitCode: typeof record.exitCode === 'number' ? record.exitCode : 1,
    pendingReboot: record.pendingReboot === true,
    data: typeof record.data === 'object' && record.data !== null ? (record.data as Record<string, unknown>) : undefined,
  }
}

/**
 * Real UAC elevation via the fixed request-elevation.ps1 launcher and a unique JSON receipt.
 * Never infers success from process launch: a missing/unreadable receipt is a safe failure.
 */
export async function elevatedOperation(
  operation: string,
  dataDirectory: string,
  serviceName?: string,
): Promise<ElevatedResult> {
  if (!(ELEVATED_OPERATIONS as readonly string[]).includes(operation)) {
    throw new Error(`Unsupported elevated operation: ${operation}`)
  }
  const op = operation as ElevatedOperation
  if (op === 'startService') {
    if (!(SELECTED_SERVICES as readonly string[]).includes(serviceName ?? '')) {
      throw new Error('startService requires a selected service name.')
    }
  } else if (serviceName !== undefined) {
    throw new Error(`Unexpected serviceName for ${op}.`)
  }
  const receipt = ensureReceiptPath(dataDirectory)
  const launcher = resolveElevatedScriptPath('request-elevation.ps1')
  const helper = resolveElevatedScriptPath('elevate.ps1')
  const argv = [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    launcher,
    '-ElevateScript',
    helper,
    '-Operation',
    op,
    '-Receipt',
    receipt,
  ]
  if (serviceName) argv.push('-ServiceName', serviceName)
  const timeoutMs = op === 'integrityRepair' ? 30 * 60 * 1000 : 120 * 1000
  const launched = await runner(powershellExe(), argv, timeoutMs)
  if (!existsSync(receipt)) {
    return {
      success: false,
      pendingReboot: false,
      exitCode: launched.exitCode === 0 ? 1223 : launched.exitCode,
      output:
        'Elevation did not complete (declined, cancelled, or blocked) and produced no receipt. ' +
        'No changes were made or inferred. ' +
        stripBom(launched.stderr || launched.stdout).trim().slice(0, 1000),
    }
  }
  try {
    const raw = readFileSync(receipt, 'utf8')
    return normalizeElevatedReceipt(parseJsonOutput<unknown>(raw))
  } catch (error) {
    return {
      success: false,
      pendingReboot: false,
      exitCode: 1,
      output: `Elevated receipt was unreadable and ignored: ${String(error).slice(0, 500)}`,
    }
  }
}
