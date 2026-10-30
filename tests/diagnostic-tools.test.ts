import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALLOWED_HOSTS,
  createDiagnosticTools,
  DIAGNOSTIC_TOOL_DEFINITIONS,
  isPublicAddress,
} from '../src/main/diagnostics';
import { SELECTED_SERVICES } from '../src/main/windows/native';

function tools() {
  return createDiagnosticTools({
    now: () => '2026-01-01T00:00:00.000Z',
    nativeRunner: async (operation, args) => {
      if (operation === 'networkState') {
        return { connected: 1, adaptersConnected: 1, adaptersTotal: 2, proxyEnabled: false };
      }
      if (operation === 'service') {
        return {
          statusText: 'Running',
          startMode: 'Auto',
          displayName: 'DNS Client',
          events: [{ id: 7031, timeCreated: '2026-01-01T00:00:00Z', message: 'ok' }],
        };
      }
      return { events: [{ id: 1001, timeCreated: '2026-01-01T00:00:00Z', message: 'ok' }] };
    },
    networkProbe: async (hostname) => ({ reachable: true, dnsStatus: 'resolved', statusCode: 200, redirected: false, note: `probe ${hostname}` }),
  });
}

describe('diagnostic tool definitions', () => {
  it('exposes three strict function definitions with closed schemas', () => {
    expect(DIAGNOSTIC_TOOL_DEFINITIONS.map((d) => d.name).sort()).toEqual([
      'windows_events',
      'windows_network',
      'windows_service',
    ]);
    for (const definition of DIAGNOSTIC_TOOL_DEFINITIONS) {
      expect(definition.type).toBe('function');
      expect(definition.strict).toBe(true);
      expect(definition.parameters.type).toBe('object');
      expect(definition.parameters.additionalProperties).toBe(false);
      expect(definition.parameters.required.length).toBeGreaterThan(0);
    }
    const network = DIAGNOSTIC_TOOL_DEFINITIONS.find((d) => d.name === 'windows_network')!;
    expect(network.parameters).toMatchObject({
      properties: { hostname: { type: 'string', enum: [...ALLOWED_HOSTS] } },
      required: ['hostname'],
    });
    const service = DIAGNOSTIC_TOOL_DEFINITIONS.find((d) => d.name === 'windows_service')!;
    expect(service.parameters.properties.serviceName).toMatchObject({ enum: [...SELECTED_SERVICES] });
    const events = DIAGNOSTIC_TOOL_DEFINITIONS.find((d) => d.name === 'windows_events')!;
    expect(events.parameters.properties.channel).toMatchObject({ enum: ['system', 'windows-update'] });
  });
});

describe('diagnostic argument validation (no probe on failure)', () => {
  it('rejects unknown tools and malformed arguments before probing', async () => {
    const seen: string[] = [];
    const api = createDiagnosticTools({
      nativeRunner: async () => {
        seen.push('native');
        return {};
      },
      networkProbe: async () => {
        seen.push('probe');
        return { reachable: true };
      },
    });
    await expect(api.invoke('windows_nonsense', {})).rejects.toThrow(/Unknown diagnostic/);
    await expect(api.invoke('windows_network', { hostname: 'https://evil.example' })).rejects.toThrow();
    await expect(api.invoke('windows_network', { hostname: ALLOWED_HOSTS[0], extra: 1 })).rejects.toThrow(/Unexpected/);
    await expect(api.invoke('windows_service', { serviceName: 'Spooler', hours: 2, maxEvents: 2 })).rejects.toThrow();
    await expect(api.invoke('windows_service', { serviceName: 'Dnscache', hours: 0, maxEvents: 9 })).rejects.toThrow();
    await expect(api.invoke('windows_events', { channel: 'security', hours: 2, maxEvents: 2 })).rejects.toThrow();
    await expect(api.invoke('windows_events', null)).rejects.toThrow();
    expect(seen).toHaveLength(0);
  });
});

describe('diagnostic normalization and bounds', () => {
  it('returns ok results for valid calls', async () => {
    const api = tools();
    const network = await api.invoke('windows_network', { hostname: ALLOWED_HOSTS[0] });
    expect(network.tool).toBe('windows_network');
    expect(network.status).toBe('ok');
    expect(network.scope).toContain(String(ALLOWED_HOSTS[0]));
    expect(JSON.stringify(network).length).toBeLessThanOrEqual(12000);
    const service = await api.invoke('windows_service', { serviceName: 'Dnscache', hours: 2, maxEvents: 2 });
    expect(service.status).toBe('ok');
    expect(service.data.eventCount).toBe(1);
    const events = await api.invoke('windows_events', { channel: 'system', hours: 2, maxEvents: 2 });
    expect(events.status).toBe('ok');
  });

  it('redacts and bounds hostile native output', async () => {
    const hostile = `C:\\Users\\alice\\secret token Bearer abc.def.ghi contact alice@example.com 10.0.0.5 MAC 00-11-22-33-44-55 adapter Intel(R) Ethernet ${'x'.repeat(900)}`;
    const api = createDiagnosticTools({
      now: () => '2026-01-01T00:00:00.000Z',
      nativeRunner: async () => ({
        events: Array.from({ length: 30 }, (_, i) => ({ id: i, timeCreated: 't', message: hostile, unknownKey: 'drop-me' })),
      }),
      networkProbe: async () => ({ reachable: true, statusCode: 200, redirected: false }),
    });
    const result = await api.invoke('windows_events', { channel: 'system', hours: 1, maxEvents: 8 });
    const text = JSON.stringify(result);
    expect(text).not.toContain('alice@example.com');
    expect(text).not.toContain('alice');
    expect(text).not.toContain('10.0.0.5');
    expect(text).not.toContain('00-11-22-33-44-55');
    expect(text).not.toContain('unknownKey');
    const events = result.data.events as Array<{ message: string }>;
    expect(events.length).toBeLessThanOrEqual(8);
    for (const event of events) expect(event.message.length).toBeLessThanOrEqual(350);
    expect(text.length).toBeLessThanOrEqual(12000);
  });

  it('maps access denied to unavailable and never-resolving calls to unavailable', async () => {
    const denied = createDiagnosticTools({
      now: () => '2026-01-01T00:00:00.000Z',
      nativeRunner: async () => {
        throw new Error('Access is denied (0x80070005)');
      },
      networkProbe: async () => ({ reachable: false, note: 'no route' }),
    });
    const service = await denied.invoke('windows_service', { serviceName: 'BITS', hours: 2, maxEvents: 2 });
    expect(service.status).toBe('unavailable');
    const hanging = createDiagnosticTools({
      now: () => '2026-01-01T00:00:00.000Z',
      timeoutMs: 20,
      probeTimeoutMs: 20,
      nativeRunner: async () => new Promise(() => {}),
      networkProbe: async () => new Promise(() => {}),
    });
    const network = await hanging.invoke('windows_network', { hostname: ALLOWED_HOSTS[0] });
    expect(['unavailable', 'error', 'partial']).toContain(network.status);
  });
});

describe('diagnostic helpers and script', () => {
  it('classifies private and reserved addresses as non-public', () => {
    for (const address of ['10.0.0.1', '192.168.1.1', '172.16.0.1', '127.0.0.1', '169.254.1.1', '224.0.0.1', '::1', 'fe80::1', 'fc00::1', 'ff02::1', '::ffff:10.0.0.1', '192.0.2.1', '203.0.113.5']) {
      expect(isPublicAddress(address), address).toBe(false);
    }
    expect(isPublicAddress('93.184.216.34')).toBe(true);
  });

  it('keeps diagnostics.ps1 read-only, validated, and bounded', () => {
    const text = readFileSync(join(process.cwd(), 'resources', 'windows', 'diagnostics.ps1'), 'utf8');
    const first = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))[0];
    expect(first).toMatch(/^param\s*\(/);
    expect(text).toMatch(/ValidateSet\('networkState','service','events'\)/);
    expect(text).toMatch(/Dnscache.*Dhcp.*NlaSvc.*W32Time.*BITS.*wuauserv.*Winmgmt/);
    expect(text).toMatch(/windows-update/);
    expect(text).toMatch(/Microsoft-Windows-WindowsUpdateClient\/Operational/);
    expect(text).toMatch(/7000,7001,7009,7011,7022,7023,7024,7031,7034/);
    expect(text).toMatch(/ValidateRange\(1,8\)/);
    expect(text).not.toMatch(/Invoke-Expression|Stop-Service|Start-Service|Set-Service|Restart-Service|Remove-Item|Stop-Process|-EncodedCommand|Invoke-WebRequest|Invoke-RestMethod|Start-Process|New-Service/);
  });
});
