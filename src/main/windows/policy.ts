import type { OperationId } from '../../shared/contracts'

/** Fixed allow-lists. Model input can never extend these. */
export const SELECTED_SERVICES = ['Dnscache', 'Dhcp', 'NlaSvc', 'W32Time', 'BITS', 'wuauserv', 'Winmgmt'] as const
export type SelectedService = (typeof SELECTED_SERVICES)[number]

export const ELEVATED_OPERATIONS = ['flushDns', 'startService', 'integrityRepair'] as const
export type ElevatedOperation = (typeof ELEVATED_OPERATIONS)[number]

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
] as const

export type DeepFamily = 'firefox' | 'steam' | 'obsidian'

export const RESTART_EXECUTABLES: Record<DeepFamily, string> = {
  firefox: 'firefox.exe',
  steam: 'steam.exe',
  obsidian: 'obsidian.exe',
}

/** Exact winget package IDs, only usable when discovered installed. Update-only: repair is not advertised. */
export const WINGET_PACKAGES: Record<DeepFamily, { id: string; capabilities: OperationId[] }> = {
  firefox: { id: 'Mozilla.Firefox', capabilities: ['app.updatePackage'] },
  steam: { id: 'Valve.Steam', capabilities: ['app.updatePackage'] },
  obsidian: { id: 'Obsidian.Obsidian', capabilities: ['app.updatePackage'] },
}
export const WINGET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}\.[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/

/** Final path segments that may be quarantined, per family. Anything else fails closed. */
export const CACHE_ALLOWLIST: Record<DeepFamily, string[]> = {
  firefox: ['cache2', 'startupCache', 'shader-cache', 'thumbnails'],
  steam: ['appcache', 'htmlcache', 'shadercache'],
  obsidian: ['Cache', 'Code Cache', 'GPUCache', 'cache'],
}

/** Relative locations searched under each app root for the allow-listed cache names. */
export const CACHE_SEARCH_RELATIVES: Record<DeepFamily, string[]> = {
  firefox: ['cache2', 'startupCache', 'shader-cache', 'thumbnails'],
  steam: ['appcache', 'config/htmlcache', 'steamapps/shadercache'],
  obsidian: ['Cache', 'Code Cache', 'GPUCache', '.obsidian/cache'],
}

export interface FirefoxPrefSpec { type: 'int' | 'host'; min?: number; max?: number }
export const FIREFOX_PREFS: Record<string, FirefoxPrefSpec> = {
  'network.proxy.type': { type: 'int', min: 0, max: 5 },
  'network.proxy.http': { type: 'host' },
  'network.proxy.http_port': { type: 'int', min: 1, max: 65535 },
  'network.proxy.ssl': { type: 'host' },
  'network.proxy.ssl_port': { type: 'int', min: 1, max: 65535 },
}

export interface ObsidianAppearanceSpec { key: 'theme' | 'cssTheme' }
export const OBSIDIAN_APPEARANCE_KEYS = ['theme', 'cssTheme'] as const
export const OBSIDIAN_THEMES = ['dark', 'light', 'system'] as const
export const OBSIDIAN_CSS_THEME_PATTERN = /^[A-Za-z0-9 _-]{1,64}$/
export const HOST_PATTERN = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,253}[A-Za-z0-9])?$/

/** Security products must never be disabled via startup repair. Fail closed. */
export const SECURITY_STARTUP_PATTERN =
  /(defender|securityhealth|security[_ -]?center|antivirus|antimalware|firewall|bitdefender|norton|mcafee|kaspersky|avast|\bavg\b|eset|sophos|malwarebytes|sentinelone|crowdstrike|carbon[_ -]?black|windows.?security)/i

export const EXECUTABLE_EXTENSIONS = new Set(
  ['.exe', '.dll', '.sys', '.msi', '.msp', '.bat', '.cmd', '.ps1', '.vbs', '.vbe', '.jse', '.wsf', '.wsh', '.scr', '.com', '.pif', '.jar'].map(s => s.toLowerCase()),
)

export interface OperationMeta {
  requiresAdmin: boolean
  reversible: boolean
  impact: string
  verification: string
  description: string
  constraints: string
}

export const OPERATION_META: Record<OperationId, OperationMeta> = {
  'windows.flushDns': {
    requiresAdmin: true,
    reversible: false,
    impact: 'Clears the local DNS resolver cache. Active connections are not dropped; names are re-resolved on next use.',
    verification: 'DNS Client service is running and a local name resolution check succeeds.',
    description: 'Clear the Windows DNS resolver cache.',
    constraints: 'Runs elevated via the fixed helper. No params. Params: {}. No backup is kept because the cache rebuilds automatically.',
  },
  'windows.clearUserProxy': {
    requiresAdmin: false,
    reversible: true,
    impact: 'Turns off the per-user WinINET proxy (ProxyEnable=0, clears ProxyServer). Other users and managed policy are untouched.',
    verification: 'Per-user ProxyEnable reads back as 0.',
    description: 'Clear the current user proxy settings with a restorable backup.',
    constraints: 'Current user hive only. No params. Params: {}. Refused when a managed proxy policy is in effect.',
  },
  'windows.startService': {
    requiresAdmin: true,
    reversible: false,
    impact: 'Starts one selected stopped Windows service. No configuration or start-type change is made.',
    verification: 'The service reports status Running.',
    description: 'Start a selected stopped Windows service.',
    constraints: 'Only the fixed service list (Dnscache, Dhcp, NlaSvc, W32Time, BITS, wuauserv, Winmgmt). Elevated via the fixed helper. Params: {"serviceName":"<selected service name>"}. Example: {"serviceName":"Dnscache"}.',
  },
  'windows.integrityRepair': {
    requiresAdmin: true,
    reversible: false,
    impact: 'Runs DISM RestoreHealth then SFC /scannow. Can take 30+ minutes and may request a reboot. Repaired system files cannot be restored by PocketBench.',
    verification: 'Windows health state is independently re-read after repair (DISM/SFC output plus CBS/pending-reboot state); a pending-reboot flag is reported distinctly instead of as failure.',
    description: 'Repair Windows system image and protected files (DISM then SFC).',
    constraints: 'Explicitly not reversible. No params. Elevated via the fixed helper. Never touches security controls or policies. Params: {}.',
  },
  'windows.disableStartup': {
    requiresAdmin: false,
    reversible: true,
    impact: 'Removes one current-user Run entry so it no longer launches at sign-in. The backed-up command can be restored.',
    verification: 'The Run value is absent afterwards.',
    description: 'Disable one current-user startup entry with backup.',
    constraints: 'HKCU Run entries only. Machine-wide (HKLM) entries are refused. Params: {"entryId":"<discovered HKCU startup id>"}. Security-related entries are refused.',
  },
  'app.repairPackage': {
    requiresAdmin: false,
    reversible: false,
    impact: 'Runs the package manager repair for the exact discovered package ID.',
    verification: 'The package still reports as installed afterwards.',
    description: 'Repair an installed application package.',
    constraints: 'Not advertised for Firefox, Steam, or Obsidian: none of them reports reliable repair support, so validation fails closed.',
  },
  'app.updatePackage': {
    requiresAdmin: false,
    reversible: false,
    impact: 'Upgrades the exact discovered package ID via winget. The previous version cannot be restored by PocketBench.',
    verification: 'The exact package ID is independently listed by winget afterwards; a version change is recorded when one occurs.',
    description: 'Update an application via winget.',
    constraints: 'Exact validated discovered package ID only; never a registry DisplayName. The OS may show its own elevation prompt. Params: {"appId":"<discovered app id>","packageId":"<exact discovered winget id>"}. Example: {"appId":"<discovered app id>","packageId":"Mozilla.Firefox"}.',
  },
  'app.quarantineCache': {
    requiresAdmin: false,
    reversible: true,
    impact: 'Moves only allow-listed cache directories to a PocketBench quarantine folder. Profiles, history, cookies, logins, saves, and documents are never matched.',
    verification: 'Cache paths are absent from the app tree and present under quarantine.',
    description: 'Quarantine application cache directories (restorable).',
    constraints: 'Final segment must be an allow-listed cache name inside explicit per-app roots. Symlinks, junctions, and executables are refused. Params: {"appId":"<discovered app id>"}.',
  },
  'app.patchConfig': {
    requiresAdmin: false,
    reversible: true,
    impact: 'Edits one supported setting in a supported app config file. The original file is backed up byte-for-byte.',
    verification: 'The setting reads back with the requested value.',
    description: 'Change one supported application setting with backup.',
    constraints: 'Firefox proxy prefs and Obsidian appearance keys only. Steam has no supported config settings. Params: {"appId":"<discovered app id>","setting":"<supported key>","value":<typed value>}. Example: {"appId":"<id>","setting":"network.proxy.type","value":0}.',
  },
  'app.restart': {
    requiresAdmin: false,
    reversible: false,
    impact: 'Politely asks the application to close (CloseMainWindow) then relaunches its exact validated executable so caches or settings take effect. Never force-kills; if the executable cannot be validated, close-only is reported honestly.',
    verification: 'The application process state is independently re-checked: running again after relaunch, or absent when close-only was performed.',
    description: 'Ask an application to close gracefully and relaunch it.',
    constraints: 'Only the known executable for the target app family, relaunched from its validated install location. Close is requested, never forced. Params: {"appId":"<discovered app id>"}.',
  },
}

export function isSelectedService(value: unknown): value is SelectedService {
  return typeof value === 'string' && (SELECTED_SERVICES as readonly string[]).includes(value)
}

export function isDeepFamily(value: unknown): value is DeepFamily {
  return value === 'firefox' || value === 'steam' || value === 'obsidian'
}

export function isWingetId(value: unknown): value is string {
  return typeof value === 'string' && WINGET_ID_PATTERN.test(value)
}
