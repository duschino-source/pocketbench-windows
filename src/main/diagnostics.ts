import { promises as dnsPromises } from 'node:dns';
import https from 'node:https';
import { isIP } from 'node:net';
import { hostname, userInfo } from 'node:os';
import { redact } from './model';
import { runScript, SELECTED_SERVICES } from './windows/native';
import type { JsonValue } from '../shared/contracts';

export const ALLOWED_HOSTS = [
  'www.microsoft.com',
  'learn.microsoft.com',
  'support.mozilla.org',
  'help.steampowered.com',
  'help.obsidian.md',
] as const;
export type AllowedHost = (typeof ALLOWED_HOSTS)[number];

export const SERVICE_CHANNELS = ['system', 'windows-update'] as const;

const TOOL_TIMEOUT_MS = 12000;
const PROBE_TIMEOUT_MS = 4000;
const MAX_EVENTS = 8;
const MAX_MESSAGE_CHARS = 350;
const MAX_OUTPUT_CHARS = 12000;
const localIdentities: string[] = [];
try { localIdentities.push(hostname(), userInfo().username); } catch { /* Identity lookup is optional; paths and account fields are still minimized. */ }

interface ToolDefinition {
  type: 'function';
  name: string;
  description: string;
  strict: true;
  parameters: {
    type: 'object';
    additionalProperties: false;
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const DIAGNOSTIC_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    name: 'windows_network',
    description: 'Read-only Windows network state plus a bounded HTTPS reachability probe to one fixed support hostname.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        hostname: { type: 'string', enum: [...ALLOWED_HOSTS] },
      },
      required: ['hostname'],
    },
  },
  {
    type: 'function',
    name: 'windows_service',
    description: 'Read-only Windows service status and recent Service Control Manager events for one whitelisted service.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        serviceName: { type: 'string', enum: [...SELECTED_SERVICES] },
        hours: { type: 'integer', minimum: 1, maximum: 24 },
        maxEvents: { type: 'integer', minimum: 1, maximum: 8 },
      },
      required: ['serviceName', 'hours', 'maxEvents'],
    },
  },
  {
    type: 'function',
    name: 'windows_events',
    description: 'Read-only Windows error/critical events from a fixed channel over a bounded time window.',
    strict: true,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        channel: { type: 'string', enum: [...SERVICE_CHANNELS] },
        hours: { type: 'integer', minimum: 1, maximum: 24 },
        maxEvents: { type: 'integer', minimum: 1, maximum: 8 },
      },
      required: ['channel', 'hours', 'maxEvents'],
    },
  },
];

export interface DiagnosticResult {
  tool: string;
  timestamp: string;
  scope: string;
  status: 'ok' | 'partial' | 'unavailable' | 'error';
  observations: string[];
  data: Record<string, JsonValue>;
}

export interface NetworkProbeResult {
  reachable: boolean;
  dnsStatus?: 'resolved' | 'failed' | 'blocked' | 'unavailable';
  statusCode?: number;
  redirected?: boolean;
  note?: string;
}

export type NativeOperation = 'networkState' | 'service' | 'events';

export interface DiagnosticToolOptions {
  nativeRunner?: (
    operation: NativeOperation,
    args: Record<string, string>,
    timeoutMs: number,
  ) => Promise<unknown>;
  networkProbe?: (hostname: string) => Promise<NetworkProbeResult>;
  platform?: string;
  now?: () => string;
  timeoutMs?: number;
  probeTimeoutMs?: number;
}

type ToolName = 'windows_network' | 'windows_service' | 'windows_events';
const TOOL_NAMES: readonly ToolName[] = ['windows_network', 'windows_service', 'windows_events'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function isIntInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function validateArgs(name: ToolName, args: unknown): Record<string, unknown> {
  if (!isPlainObject(args)) throw new Error(`Invalid arguments for ${name}: expected an object.`);
  const specs: Record<ToolName, { required: string[]; check: (key: string, value: unknown) => void }> = {
    windows_network: {
      required: ['hostname'],
      check: (key, value) => {
        if (key !== 'hostname') throw new Error(`Unexpected argument for windows_network: ${key}`);
        if (!(ALLOWED_HOSTS as readonly string[]).includes(value as string)) {
          throw new Error('Unsupported hostname.');
        }
      },
    },
    windows_service: {
      required: ['serviceName', 'hours', 'maxEvents'],
      check: (key, value) => {
        if (key === 'serviceName') {
          if (!(SELECTED_SERVICES as readonly string[]).includes(value as string)) {
            throw new Error('Unsupported service name.');
          }
        } else if (key === 'hours') {
          if (!isIntInRange(value, 1, 24)) throw new Error('hours must be an integer 1..24.');
        } else if (key === 'maxEvents') {
          if (!isIntInRange(value, 1, 8)) throw new Error('maxEvents must be an integer 1..8.');
        } else {
          throw new Error(`Unexpected argument for windows_service: ${key}`);
        }
      },
    },
    windows_events: {
      required: ['channel', 'hours', 'maxEvents'],
      check: (key, value) => {
        if (key === 'channel') {
          if (!(SERVICE_CHANNELS as readonly string[]).includes(value as string)) {
            throw new Error('Unsupported channel.');
          }
        } else if (key === 'hours') {
          if (!isIntInRange(value, 1, 24)) throw new Error('hours must be an integer 1..24.');
        } else if (key === 'maxEvents') {
          if (!isIntInRange(value, 1, 8)) throw new Error('maxEvents must be an integer 1..8.');
        } else {
          throw new Error(`Unexpected argument for windows_events: ${key}`);
        }
      },
    },
  };
  const spec = specs[name];
  for (const key of Object.keys(args)) spec.check(key, args[key]);
  for (const key of spec.required) {
    if (!Object.hasOwn(args, key)) throw new Error(`Missing required argument for ${name}: ${key}`);
  }
  return args;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([
    promise.then(
      (value) => {
        if (timer) clearTimeout(timer);
        return value;
      },
      (error) => {
        if (timer) clearTimeout(timer);
        throw error;
      },
    ),
    timeout,
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function minimize(text: string): string {
  return text
    .replace(/\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g, '[MAC]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]')
    .replace(/(?<![A-Za-z0-9_])(?:[0-9a-f]{1,4}:|:){2,}[0-9a-f:.]+(?:%[a-z0-9]+)?/gi, candidate => isIP(candidate) === 6 || isIP(candidate.replace(/\.$/, '')) === 6 ? '[IP]' : candidate)
    .replace(/[A-Za-z]:[\\/][^\s"'<>|]*/g, '[PATH]')
    .replace(/\\\\[^\s"'<>|]*/g, '[PATH]')
    .replace(/\b[A-Za-z0-9_.-]+\\[A-Za-z0-9_$.-]+\b/g, '[ACCOUNT]')
    .replace(/\bS-1-(?:\d+-){1,14}\d+\b/gi, '[SID]')
    .replace(/\b(?:computer|machine|user|account|ssid|adapter|interface)\s*[:=]\s*[^,;\r\n]+/gi, '[IDENTITY]')
    .replace(/((?:api[_-]?key|password|secret|(?:access|refresh)[_-]?token)["']?\s*[:=]\s*["']?)[^\s,;"'}]+/gi, '$1[REDACTED]');
}

function safeMessage(value: unknown, max = MAX_MESSAGE_CHARS): string {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  let cleaned = minimize(redact(raw)).replace(/\s+/g, ' ').trim();
  for (const identity of localIdentities) {
    if (identity.length >= 3) cleaned = cleaned.replace(new RegExp('(?<![A-Za-z0-9_])' + identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_])', 'gi'), '[IDENTITY]');
  }
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max);
}

export { safeMessage as minimizeDiagnosticText };

function safeShort(value: unknown, max = 64): string {
  return safeMessage(value, max);
}

function classifyError(error: unknown): 'unavailable' | 'error' {
  const text = String((error as { message?: unknown })?.message ?? error);
  if (/access (is )?denied|unauthorized|0x80070005|permission|privilege|elevation|UAC|unavailable/i.test(text)) {
    return 'unavailable';
  }
  if (/timed?\s?out|timeout|ETIMEDOUT|EABORT|aborted|exceeded/i.test(text)) return 'unavailable';
  return 'error';
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function toNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 1) return value === 1;
  if (value === '0' || value === '1') return value === '1';
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  return undefined;
}

interface NormalizedEvent {
  id: JsonValue;
  time: string;
  message: string;
}

function normalizeEvent(raw: unknown): NormalizedEvent {
  const record = asRecord(raw);
  const idRaw = record.id ?? record.Id ?? record.EventId;
  const idNum = toNumber(idRaw);
  const timeRaw = record.timeCreated ?? record.TimeCreated ?? record.time ?? record.timestamp;
  return {
    id: idNum !== undefined && Number.isInteger(idNum) && idNum >= 0 && idNum <= 65535 ? idNum : null,
    time: typeof timeRaw === 'string' && timeRaw.length <= 64 && Number.isFinite(Date.parse(timeRaw)) ? new Date(timeRaw).toISOString() : 'unknown',
    message: safeMessage(record.message ?? record.Message ?? 'Event recorded.'),
  };
}

function normalizeEvents(raw: unknown, limit = MAX_EVENTS): NormalizedEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, limit).map(normalizeEvent);
}

function enforceBound(result: DiagnosticResult): DiagnosticResult {
  let encoded = JSON.stringify(result);
  while (encoded.length > MAX_OUTPUT_CHARS && result.observations.length > 1) {
    result.observations.pop();
    encoded = JSON.stringify(result);
  }
  if (encoded.length > MAX_OUTPUT_CHARS) {
    result.observations = result.observations.map((line) =>
      line.length > 100 ? line.slice(0, 100) : line,
    );
    encoded = JSON.stringify(result);
  }
  if (encoded.length > MAX_OUTPUT_CHARS) {
    const events = (result.data.events as unknown as unknown[]);
    if (Array.isArray(events)) {
      result.data.events = events.slice(0, 2) as JsonValue;
      encoded = JSON.stringify(result);
    }
  }
  if (encoded.length > MAX_OUTPUT_CHARS) {
    result.data = { truncated: true };
    result.observations = [result.observations[0] ?? 'Diagnostic output truncated.'];
  }
  return result;
}

function defaultNativeRunner(
  operation: NativeOperation,
  args: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  return runScript('diagnostics.ps1', { Operation: operation, ...args }, timeoutMs);
}

function isPublicIPv4(octets: number[]): boolean {
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = octets;
  if (a === 10) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 0) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224 && a <= 239) return false;
  if (a >= 240) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  return true;
}

export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPublicIPv4(address.split('.').map(Number));
  if (version !== 6 || address.includes('%') || address.includes('.')) return false;
  const lower = address.toLowerCase();
  const [first, second] = lower.split(':').map(group => parseInt(group || '0', 16));
  // Only global unicast; exclude special-purpose, documentation and transition ranges.
  return first >= 0x2000 && first <= 0x3fff && first !== 0x2002
    && !(first === 0x2001 && (second < 0x200 || second === 0xdb8))
    && !(first === 0x3fff && second < 0x1000);
}

function httpsHeadPinned(hostname: string, ip: string, family: 4 | 6, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        host: ip,
        servername: hostname,
        port: 443,
        method: 'HEAD',
        path: '/',
        headers: { Host: hostname, Connection: 'close', 'User-Agent': 'PocketBench-Diagnostics' },
        rejectUnauthorized: true,
        timeout: timeoutMs,
        signal: AbortSignal.timeout(timeoutMs),
        maxHeaderSize: 8192,
        agent: false,
        lookup: (_host: string, _options: unknown, callback: (error: null, address: string, family: number) => void) => {
          callback(null, ip, family);
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        response.destroy();
        resolve(status);
      },
    );
    request.on('timeout', () => request.destroy(new Error('HTTPS probe timed out')));
    request.on('error', reject);
    request.end();
  });
}

async function defaultNetworkProbe(hostname: string): Promise<NetworkProbeResult> {
  if (!(ALLOWED_HOSTS as readonly string[]).includes(hostname)) {
    throw new Error('Unsupported hostname.');
  }
  const deadline = Date.now() + PROBE_TIMEOUT_MS;
  let records: Awaited<ReturnType<typeof dnsPromises.lookup>>[];
  try { records = await withTimeout(dnsPromises.lookup(hostname, { all: true }), PROBE_TIMEOUT_MS, 'DNS lookup'); }
  catch { return { reachable: false, dnsStatus: 'failed', note: 'DNS lookup failed or timed out.' }; }
  if (!records.length) return { reachable: false, dnsStatus: 'failed', note: 'DNS returned no addresses.' };
  for (const record of records) {
    if (!isPublicAddress(record.address)) {
      return { reachable: false, dnsStatus: 'blocked', note: 'DNS resolved to a non-public or reserved address; HTTPS was blocked.' };
    }
  }
  const first = records[0];
  const remaining = deadline - Date.now();
  if (remaining < 1) return { reachable: false, dnsStatus: 'resolved', note: 'DNS completed; no time remained for HTTPS.' };
  try {
    const statusCode = await httpsHeadPinned(hostname, first.address, first.family === 6 ? 6 : 4, remaining);
    return {
    reachable: true,
    dnsStatus: 'resolved',
    statusCode,
    redirected: statusCode >= 300 && statusCode < 400,
    note: `HTTPS HEAD / returned ${statusCode}.`,
    };
  } catch { return { reachable: false, dnsStatus: 'resolved', note: 'TLS-verified HTTPS did not complete within the probe deadline.' }; }
}

async function runNetwork(
  args: Record<string, unknown>,
  runner: NonNullable<DiagnosticToolOptions['nativeRunner']>,
  probe: NonNullable<DiagnosticToolOptions['networkProbe']>,
  now: () => string,
  timeoutMs: number,
  probeTimeoutMs: number,
): Promise<DiagnosticResult> {
  const hostname = args.hostname as AllowedHost;
  const observations: string[] = [];
  const data: Record<string, JsonValue> = { hostname };
  const [native, network] = await Promise.allSettled([
    withTimeout(runner('networkState', {}, timeoutMs), timeoutMs, 'network state'),
    withTimeout(probe(hostname), probeTimeoutMs, 'network probe'),
  ]);
  let nativeOk = false;
  if (native.status === 'fulfilled') {
    const raw = asRecord(native.value);
    for (const [key, label] of [['connected', 'Connected network profiles'], ['adaptersConnected', 'Adapters reporting up'], ['adaptersTotal', 'Total visible adapters']] as const) {
      const count = toNumber(raw[key]);
      if (count !== undefined && Number.isInteger(count) && count >= 0 && count <= 4096) {
        data[key] = count;
        observations.push(label + ': ' + count + '.');
        nativeOk = true;
      }
    }
    const proxy = toBoolean(raw.proxyEnabled);
    if (proxy !== undefined) {
      data.proxyEnabled = proxy;
      observations.push('Current-user proxy is ' + (proxy ? 'enabled.' : 'not enabled.'));
      nativeOk = true;
    }
    if (Array.isArray(raw.notes)) observations.push(...raw.notes.slice(0, 3).map(note => safeMessage(note, 150)));
    if (raw.status === 'partial' || raw.status === 'unavailable' || raw.status === 'error') nativeOk = false;
    if (!nativeOk) observations.push('Some or all native network observations were unavailable.');
  } else observations.push('Native network state unavailable: ' + safeMessage(native.reason?.message, 120));

  const nativeObservationCount = observations.length;
  let networkOk = false;
  if (network.status === 'fulfilled' && typeof network.value?.reachable === 'boolean') {
    const value = network.value;
    const dnsStatus = ['resolved', 'failed', 'blocked', 'unavailable'].includes(value.dnsStatus || '') ? value.dnsStatus! : 'unavailable';
    data.dnsStatus = dnsStatus;
    observations.push('DNS outcome for ' + hostname + ': ' + dnsStatus + '.');
    const httpStatus = typeof value.statusCode === 'number' && Number.isInteger(value.statusCode) && value.statusCode >= 100 && value.statusCode <= 599 ? value.statusCode : undefined;
    networkOk = value.reachable && dnsStatus === 'resolved' && httpStatus !== undefined;
    data.reachable = value.reachable;
    if (httpStatus !== undefined) data.httpStatus = httpStatus;
    observations.push(value.reachable && httpStatus !== undefined
      ? 'TLS-verified HTTPS HEAD / to ' + hostname + ' returned HTTP ' + httpStatus + (httpStatus >= 300 && httpStatus < 400 ? '; redirect was not followed.' : '.')
      : 'HTTPS outcome for ' + hostname + ': not reached. ' + safeMessage(value.note || 'No outcome available.', 150));
  } else {
    data.dnsStatus = 'unavailable'; data.reachable = false;
    observations.push('DNS/HTTPS probe unavailable or timed out; reachability was not established.');
  }
  observations.push('DIRECT Node HTTPS to one host only; does not exercise WinINET/user proxy, browser settings, or application/VPN policy, and does not establish full application connectivity.');
  observations.unshift(...observations.splice(nativeObservationCount));
  return enforceBound({
    tool: 'windows_network', timestamp: now(), scope: 'network:' + hostname,
    status: nativeOk && networkOk ? 'ok' : nativeOk || networkOk || Object.keys(data).length > 3 ? 'partial' : 'unavailable',
    observations, data,
  });
}

async function runService(
  args: Record<string, unknown>,
  runner: NonNullable<DiagnosticToolOptions['nativeRunner']>,
  now: () => string,
  timeoutMs: number,
): Promise<DiagnosticResult> {
  const serviceName = args.serviceName as string;
  const hours = args.hours as number;
  const maxEvents = args.maxEvents as number;
  const scope = `service:${serviceName}`;
  try {
    const raw = asRecord(
      await withTimeout(
        runner('service', { ServiceName: serviceName, Hours: String(hours), MaxEvents: String(maxEvents) }, timeoutMs),
        timeoutMs,
        'service probe',
      ),
    );
    if (raw.status === 'unavailable' || raw.status === 'error') {
      return enforceBound({
        tool: 'windows_service',
        timestamp: now(),
        scope,
        status: raw.status,
        observations: [safeMessage(raw.note ?? 'Service data unavailable (access denied or missing channel).')],
        data: { serviceName },
      });
    }
    const statusText = ['Running', 'Stopped', 'StartPending', 'StopPending', 'ContinuePending', 'PausePending', 'Paused'].includes(String(raw.statusText)) ? String(raw.statusText) : 'Unknown';
    const startMode = ['Auto', 'Automatic', 'Manual', 'Disabled', 'Boot', 'System'].includes(String(raw.startMode)) ? String(raw.startMode) : undefined;
    const eventsAvailable = Array.isArray(raw.events) && raw.eventStatus !== 'unavailable' && raw.eventStatus !== 'error';
    const events = normalizeEvents(raw.events, maxEvents);
    const observations = [
      `Service ${serviceName} status: ${safeShort(statusText)}${startMode ? ` (start mode ${safeShort(startMode)})` : ''}.`,
      !eventsAvailable ? 'Related service events could not be read; absence of errors was not established.' : events.length > 0
        ? `Found ${events.length} related service event(s) in the last ${hours} hour(s).`
        : `No matching service events among at most 200 recent SCM candidates in the last ${hours} hour(s).`,
      ...events.map(event => safeMessage(`Event ${event.id ?? 'unknown'} at ${event.time}: ${event.message}`)),
    ];
    if (Array.isArray(raw.notes)) observations.push(...raw.notes.slice(0, 3).map(note => safeMessage(note)));
    const data: Record<string, JsonValue> = {
      serviceName,
      status: safeShort(statusText),
      eventCount: events.length,
      events: events.map((event) => ({ id: event.id, time: event.time, message: event.message })),
    };
    if (startMode) data.startMode = safeShort(startMode);
    const status = statusText === 'Unknown' ? 'unavailable' : raw.status === 'partial' || !startMode || !eventsAvailable ? 'partial' : 'ok';
    return enforceBound({ tool: 'windows_service', timestamp: now(), scope, status, observations, data });
  } catch (error) {
    return enforceBound({
      tool: 'windows_service',
      timestamp: now(),
      scope,
      status: classifyError(error),
      observations: [`Service data unavailable: ${safeMessage((error as Error)?.message ?? error, 120)}`],
      data: { serviceName },
    });
  }
}

async function runEvents(
  args: Record<string, unknown>,
  runner: NonNullable<DiagnosticToolOptions['nativeRunner']>,
  now: () => string,
  timeoutMs: number,
): Promise<DiagnosticResult> {
  const channel = args.channel as string;
  const hours = args.hours as number;
  const scope = `events:${channel}`;
  try {
    const raw = asRecord(
      await withTimeout(
        runner(
          'events',
          { Channel: channel, Hours: String(args.hours as number), MaxEvents: String(args.maxEvents as number) },
          timeoutMs,
        ),
        timeoutMs,
        'events probe',
      ),
    );
    if (raw.status === 'unavailable' || raw.status === 'error' || !Array.isArray(raw.events)) {
      return enforceBound({
        tool: 'windows_events',
        timestamp: now(),
        scope,
        status: raw.status === 'error' ? 'error' : 'unavailable',
        observations: [safeMessage(raw.note ?? 'Event channel unavailable (access denied or missing).')],
        data: { channel },
      });
    }
    const events = normalizeEvents(raw.events, args.maxEvents as number);
    const observations = [
      events.length > 0
        ? `Found ${events.length} error/critical event(s) in ${channel} over the last ${hours} hour(s).`
        : `No error/critical events in ${channel} over the last ${hours} hour(s).`,
      ...events.map(event => safeMessage(`Event ${event.id ?? 'unknown'} at ${event.time}: ${event.message}`)),
    ];
    return enforceBound({
      tool: 'windows_events',
      timestamp: now(),
      scope,
      status: raw.status === 'partial' ? 'partial' : 'ok',
      observations,
      data: {
        channel,
        eventCount: events.length,
        events: events.map((event) => ({ id: event.id, time: event.time, message: event.message })),
      },
    });
  } catch (error) {
    return enforceBound({
      tool: 'windows_events',
      timestamp: now(),
      scope,
      status: classifyError(error),
      observations: [`Event data unavailable: ${safeMessage((error as Error)?.message ?? error, 120)}`],
      data: { channel },
    });
  }
}

export function createDiagnosticTools(options: DiagnosticToolOptions = {}): {
  invoke: (name: string, args: unknown) => Promise<DiagnosticResult>;
} {
  const runner = options.nativeRunner ?? ((options.platform ?? process.platform) === 'win32' ? defaultNativeRunner : async () => { throw new Error('Native Windows diagnostics are unavailable on this platform.'); });
  const probe = options.networkProbe ?? defaultNetworkProbe;
  const clock = options.now ?? (() => new Date().toISOString());
  const timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? TOOL_TIMEOUT_MS, TOOL_TIMEOUT_MS));
  const probeTimeoutMs = Math.max(1, Math.min(options.probeTimeoutMs ?? PROBE_TIMEOUT_MS, PROBE_TIMEOUT_MS));

  async function invoke(name: string, args: unknown): Promise<DiagnosticResult> {
    if (!(TOOL_NAMES as readonly string[]).includes(name)) {
      throw new Error(`Unknown diagnostic tool: ${name}`);
    }
    const tool = name as ToolName;
    const validated = validateArgs(tool, args);
    const bounded = withTimeout(
      tool === 'windows_network'
        ? runNetwork(validated, runner, probe, clock, timeoutMs, probeTimeoutMs)
        : tool === 'windows_service'
          ? runService(validated, runner, clock, timeoutMs)
          : runEvents(validated, runner, clock, timeoutMs),
      timeoutMs,
      `${tool} diagnostic`,
    );
    try {
      return await bounded;
    } catch (error) {
      const scope =
        tool === 'windows_network'
          ? `network:${String((validated as Record<string, unknown>).hostname)}`
          : tool === 'windows_service'
            ? `service:${String((validated as Record<string, unknown>).serviceName)}`
            : `events:${String((validated as Record<string, unknown>).channel)}`;
      return enforceBound({
        tool,
        timestamp: clock(),
        scope,
        status: classifyError(error),
        observations: [`Diagnostic unavailable: ${safeMessage((error as Error)?.message ?? error, 120)}`],
        data: { scope },
      });
    }
  }

  return { invoke };
}
