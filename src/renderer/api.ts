import type { PocketBenchAPI, UpdateState } from '../shared/contracts';

/** The renderer talks to the backend exclusively through window.pocketbench. */
export function getApi(): PocketBenchAPI {
  const api = window.pocketbench;
  if (!api) {
    throw new Error('PocketBench backend is unavailable. Restart the application.');
  }
  return api;
}

export function toMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

/** A preview fixture may predate newer preload methods; never call a missing method. */
export function hasApiMethod<K extends keyof PocketBenchAPI>(api: PocketBenchAPI, key: K): boolean {
  return typeof api[key] === 'function';
}

export interface UpdateApiAvailability {
  cancelOperation: boolean;
  getUpdateState: boolean;
  checkForUpdates: boolean;
  installUpdate: boolean;
  onUpdate: boolean;
}

export function readApiAvailability(): UpdateApiAvailability {
  try {
    const api = getApi();
    return {
      cancelOperation: hasApiMethod(api, 'cancelOperation'),
      getUpdateState: hasApiMethod(api, 'getUpdateState'),
      checkForUpdates: hasApiMethod(api, 'checkForUpdates'),
      installUpdate: hasApiMethod(api, 'installUpdate'),
      onUpdate: hasApiMethod(api, 'onUpdate'),
    };
  } catch {
    return {
      cancelOperation: false,
      getUpdateState: false,
      checkForUpdates: false,
      installUpdate: false,
      onUpdate: false,
    };
  }
}

const UPDATE_STATUSES = new Set<string>([
  'idle',
  'checking',
  'available',
  'downloading',
  'downloaded',
  'error',
  'manual',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUpdateStatus(value: unknown): value is UpdateState['status'] {
  return typeof value === 'string' && UPDATE_STATUSES.has(value);
}

/**
 * Narrow the IPC payload without trusting it. Older preview fixtures can omit
 * `supported`/`trustedPublisher`; missing capabilities stay false, never true.
 */
export function readUpdateState(value: unknown): UpdateState | null {
  if (!isRecord(value) || !isUpdateStatus(value.status)) return null;
  const state: UpdateState = {
    status: value.status,
    supported: value.supported === true,
    trustedPublisher: value.trustedPublisher === true,
  };
  if (typeof value.version === 'string' && value.version.trim()) state.version = value.version;
  if (
    typeof value.percent === 'number' &&
    Number.isFinite(value.percent) &&
    value.percent >= 0 &&
    value.percent <= 100
  ) {
    state.percent = value.percent;
  }
  if (typeof value.message === 'string' && value.message.trim()) state.message = value.message;
  if (typeof value.releaseUrl === 'string' && value.releaseUrl.trim()) state.releaseUrl = value.releaseUrl;
  return state;
}
