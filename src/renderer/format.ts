import type { RepairPlan, RepairRun, UpdateState } from '../shared/contracts';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 ? String(Math.round(value)) : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

export function formatUptime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return 'Unknown';
  const total = Math.floor(totalSeconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
}

export function formatUSD(amount: number): string {
  if (!Number.isFinite(amount)) return 'Unknown';
  return `$${amount.toFixed(2)}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

/** Wall time since an operation started. Never estimated. */
export function formatElapsed(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '0:00';
  const total = Math.floor(milliseconds / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Only public HTTPS links are opened by the backend. */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function updateStatusLabel(status: UpdateState['status']): string {
  switch (status) {
    case 'idle':
      return 'Idle';
    case 'checking':
      return 'Checking';
    case 'available':
      return 'Update available';
    case 'downloading':
      return 'Downloading';
    case 'downloaded':
      return 'Ready to restart';
    case 'error':
      return 'Update error';
    case 'manual':
      return 'Manual update';
  }
}

export function planStatusLabel(status: RepairPlan['status']): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'needs-validation':
      return 'Needs validation';
    case 'blocked':
      return 'Blocked';
  }
}

export function runStatusLabel(status: RepairRun['status']): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'fixed':
      return 'Fixed';
    case 'failed':
      return 'Failed';
    case 'pending-verification':
      return 'Pending verification';
    case 'undone':
      return 'Undone';
    case 'partially-undone':
      return 'Partially undone';
  }
}
