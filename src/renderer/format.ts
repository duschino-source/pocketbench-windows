import type { RepairPlan, RepairRun } from '../shared/contracts';

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
  }
}
