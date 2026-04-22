import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAppsConfig, _testReset } from '../appsConfig';

let dir: string;
let originalPath: string | undefined;
let originalPublicOrigin: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'apps-config-'));
  originalPath = process.env.APPS_CONFIG_PATH;
  originalPublicOrigin = process.env.PUBLIC_ORIGIN;
  _testReset();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  if (originalPath === undefined) delete process.env.APPS_CONFIG_PATH;
  else process.env.APPS_CONFIG_PATH = originalPath;
  if (originalPublicOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
  else process.env.PUBLIC_ORIGIN = originalPublicOrigin;
  _testReset();
});

async function writeConfig(body: unknown): Promise<string> {
  const path = join(dir, 'appsConfig.json');
  await writeFile(path, JSON.stringify(body), 'utf8');
  process.env.APPS_CONFIG_PATH = path;
  return path;
}

describe('loadAppsConfig', () => {
  it('derives port-based URLs when PUBLIC_ORIGIN is localhost (the default)', async () => {
    delete process.env.PUBLIC_ORIGIN;
    await writeConfig({
      apps: [
        {
          id: 'demo',
          name: 'Demo',
          port: 3000,
          iconUrl: '',
          description: 'A demo app',
        },
      ],
    });

    const config = await loadAppsConfig();
    expect(config).toEqual([
      {
        id: 'demo',
        name: 'Demo',
        url: 'http://localhost:3000',
        iconUrl: '',
        description: 'A demo app',
      },
    ]);
  });

  it('derives port-based URLs on IPv4 literals (LAN testing from a phone)', async () => {
    process.env.PUBLIC_ORIGIN = 'http://192.168.1.198:3000';
    await writeConfig({
      apps: [
        {
          id: 'portfolio',
          name: 'Portfolio',
          port: 3003,
          iconUrl: '',
          description: '',
        },
      ],
    });

    const [app] = await loadAppsConfig();
    expect(app.url).toBe('http://192.168.1.198:3003');
  });

  it('derives subdomain-based URLs when PUBLIC_ORIGIN is a proper domain', async () => {
    process.env.PUBLIC_ORIGIN = 'https://robscholey.com';
    await writeConfig({
      apps: [
        {
          id: 'portfolio',
          name: 'Portfolio',
          port: 3003,
          subdomain: 'portfolio',
          iconUrl: '',
          description: '',
        },
      ],
    });

    const [app] = await loadAppsConfig();
    expect(app.url).toBe('https://portfolio.robscholey.com');
  });

  it('defaults subdomain to id when deriving domain-based URLs', async () => {
    process.env.PUBLIC_ORIGIN = 'https://robscholey.com';
    await writeConfig({
      apps: [
        {
          id: 'admin',
          name: 'Admin',
          port: 3005,
          iconUrl: '',
          description: '',
        },
      ],
    });

    const [app] = await loadAppsConfig();
    expect(app.url).toBe('https://admin.robscholey.com');
  });

  it('uses an explicit url verbatim, bypassing derivation', async () => {
    process.env.PUBLIC_ORIGIN = 'https://robscholey.com';
    await writeConfig({
      apps: [
        {
          id: 'canopy',
          name: 'Canopy',
          url: 'https://canopy.external.example',
          iconUrl: '',
          description: '',
        },
      ],
    });

    const [app] = await loadAppsConfig();
    expect(app.url).toBe('https://canopy.external.example');
  });

  it('preserves the PUBLIC_ORIGIN protocol when deriving subdomain URLs', async () => {
    // Tunnel-less local prod-parity testing might run HTTP behind Caddy —
    // the derived URL scheme tracks PUBLIC_ORIGIN, not a hardcoded "https".
    process.env.PUBLIC_ORIGIN = 'http://example.test';
    await writeConfig({
      apps: [
        {
          id: 'portfolio',
          name: 'Portfolio',
          port: 3003,
          iconUrl: '',
          description: '',
        },
      ],
    });

    const [app] = await loadAppsConfig();
    expect(app.url).toBe('http://portfolio.example.test');
  });

  it('caches after first read', async () => {
    const path = await writeConfig({ apps: [] });

    const first = await loadAppsConfig();
    await writeFile(
      path,
      JSON.stringify({
        apps: [{ id: 'x', name: 'X', port: 3000, iconUrl: '', description: '' }],
      }),
      'utf8',
    );
    const second = await loadAppsConfig();

    expect(second).toBe(first);
  });

  it('throws when APPS_CONFIG_PATH is unset', async () => {
    delete process.env.APPS_CONFIG_PATH;
    await expect(loadAppsConfig()).rejects.toThrow(/APPS_CONFIG_PATH/);
  });

  it('throws when PUBLIC_ORIGIN is malformed', async () => {
    process.env.PUBLIC_ORIGIN = 'not a url';
    await writeConfig({ apps: [] });
    await expect(loadAppsConfig()).rejects.toThrow(/PUBLIC_ORIGIN/);
  });

  it('throws on missing "apps" key', async () => {
    await writeConfig({ notApps: [] });
    await expect(loadAppsConfig()).rejects.toThrow(/apps/);
  });

  it('throws when "apps" is not an array', async () => {
    await writeConfig({ apps: 'nope' });
    await expect(loadAppsConfig()).rejects.toThrow(/must be an array/);
  });

  it('throws on missing string fields', async () => {
    await writeConfig({
      apps: [{ id: 'x', name: 'X', port: 3000, iconUrl: '' }], // missing description
    });
    await expect(loadAppsConfig()).rejects.toThrow(/description/);
  });

  it('throws on non-string field', async () => {
    await writeConfig({
      apps: [{ id: 1, name: 'X', port: 3000, iconUrl: '', description: '' }],
    });
    await expect(loadAppsConfig()).rejects.toThrow(/id/);
  });

  it('throws when id does not match the slug pattern', async () => {
    await writeConfig({
      apps: [
        { id: 'Bad_ID', name: 'X', port: 3000, iconUrl: '', description: '' },
      ],
    });
    await expect(loadAppsConfig()).rejects.toThrow(/id/);
  });

  it('throws when neither url nor port is set', async () => {
    await writeConfig({
      apps: [{ id: 'x', name: 'X', iconUrl: '', description: '' }],
    });
    await expect(loadAppsConfig()).rejects.toThrow(/url.*port|port.*url/);
  });

  it('preserves ownerOnly when true', async () => {
    await writeConfig({
      apps: [
        {
          id: 'admin',
          name: 'Admin',
          port: 3005,
          iconUrl: '',
          description: '',
          ownerOnly: true,
        },
      ],
    });

    const [app] = await loadAppsConfig();
    expect(app.ownerOnly).toBe(true);
  });

  it('omits ownerOnly when absent or false', async () => {
    await writeConfig({
      apps: [
        {
          id: 'a',
          name: 'A',
          port: 3000,
          iconUrl: '',
          description: '',
        },
        {
          id: 'b',
          name: 'B',
          port: 3001,
          iconUrl: '',
          description: '',
          ownerOnly: false,
        },
      ],
    });

    const [a, b] = await loadAppsConfig();
    expect(a.ownerOnly).toBeUndefined();
    expect(b.ownerOnly).toBeUndefined();
  });

  it('throws when ownerOnly is not a boolean', async () => {
    await writeConfig({
      apps: [
        {
          id: 'x',
          name: 'X',
          port: 3000,
          iconUrl: '',
          description: '',
          ownerOnly: 'yes',
        },
      ],
    });
    await expect(loadAppsConfig()).rejects.toThrow(/ownerOnly/);
  });

  it('parses optional selector-metadata fields when set', async () => {
    await writeConfig({
      apps: [
        {
          id: 'demo',
          name: 'Demo',
          port: 3000,
          iconUrl: '',
          description: '',
          version: '0.3.0',
          lastUpdatedAt: '2026-04-18T00:00:00.000Z',
          statusVariant: 'live',
          visualKey: 'bars',
        },
      ],
    });

    const [entry] = await loadAppsConfig();
    expect(entry.version).toBe('0.3.0');
    expect(entry.lastUpdatedAt).toBe('2026-04-18T00:00:00.000Z');
    expect(entry.statusVariant).toBe('live');
    expect(entry.visualKey).toBe('bars');
  });

  it('rejects unknown statusVariant values', async () => {
    await writeConfig({
      apps: [
        {
          id: 'x',
          name: 'X',
          port: 3000,
          iconUrl: '',
          description: '',
          statusVariant: 'retired',
        },
      ],
    });
    await expect(loadAppsConfig()).rejects.toThrow(/statusVariant/);
  });

  it('rejects non-ISO lastUpdatedAt strings', async () => {
    await writeConfig({
      apps: [
        {
          id: 'x',
          name: 'X',
          port: 3000,
          iconUrl: '',
          description: '',
          lastUpdatedAt: 'yesterday',
        },
      ],
    });
    await expect(loadAppsConfig()).rejects.toThrow(/lastUpdatedAt/);
  });

  it('accepts optional dev-orchestration fields (dir, port, envFile)', async () => {
    await writeConfig({
      apps: [
        {
          id: 'demo',
          name: 'Demo',
          port: 3002,
          iconUrl: '',
          description: '',
          dir: 'robscholey_template-child-nextJS',
          envFile: '.env',
        },
      ],
    });

    // Validation passes; dev-orchestration fields are intentionally not surfaced
    // on the returned AppConfig — they're for the workspace dev scripts only.
    const [entry] = await loadAppsConfig();
    expect(entry).not.toHaveProperty('dir');
    expect(entry).not.toHaveProperty('envFile');
  });

  it('rejects non-string dir', async () => {
    await writeConfig({
      apps: [
        {
          id: 'x',
          name: 'X',
          port: 3000,
          iconUrl: '',
          description: '',
          dir: 42,
        },
      ],
    });
    await expect(loadAppsConfig()).rejects.toThrow(/dir/);
  });

  it('rejects non-integer port', async () => {
    await writeConfig({
      apps: [
        {
          id: 'x',
          name: 'X',
          iconUrl: '',
          description: '',
          port: '3000',
        },
      ],
    });
    await expect(loadAppsConfig()).rejects.toThrow(/port/);
  });

  it('rejects non-string subdomain', async () => {
    await writeConfig({
      apps: [
        {
          id: 'x',
          name: 'X',
          port: 3000,
          iconUrl: '',
          description: '',
          subdomain: 42,
        },
      ],
    });
    await expect(loadAppsConfig()).rejects.toThrow(/subdomain/);
  });
});
