import type { PocketBenchAPI } from '../shared/contracts';

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
