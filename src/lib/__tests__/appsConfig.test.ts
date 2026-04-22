import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAppsConfig, _testReset } from '../appsConfig';

let dir: string;
let originalPath: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'apps-config-'));
  originalPath = process.env.APPS_CONFIG_PATH;
  _testReset();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  if (originalPath === undefined) delete process.env.APPS_CONFIG_PATH;
  else process.env.APPS_CONFIG_PATH = originalPath;
  _testReset();
});

async function writeConfig(body: unknown): Promise<string> {
  const path = join(dir, 'appsConfig.json');
  await writeFile(path, JSON.stringify(body), 'utf8');
  process.env.APPS_CONFIG_PATH = path;
  return path;
}

describe('loadAppsConfig', () => {
  it('loads a valid config', async () => {
    await writeConfig({
      apps: [
        {
          id: 'demo',
          name: 'Demo',
          url: 'http://localhost:3000',
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

  it('caches after first read', async () => {
    const path = await writeConfig({ apps: [] });

    const first = await loadAppsConfig();
    await writeFile(
      path,
      JSON.stringify({
        apps: [{ id: 'x', name: 'X', url: 'u', iconUrl: '', description: '' }],
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
      apps: [{ id: 'x', name: 'X', url: 'u', iconUrl: '' }], // missing description
    });
    await expect(loadAppsConfig()).rejects.toThrow(/description/);
  });

  it('throws on non-string field', async () => {
    await writeConfig({
      apps: [{ id: 1, name: 'X', url: 'u', iconUrl: '', description: '' }],
    });
    await expect(loadAppsConfig()).rejects.toThrow(/id/);
  });

  it('preserves ownerOnly when true', async () => {
    await writeConfig({
      apps: [
        {
          id: 'admin',
          name: 'Admin',
          url: 'http://localhost:3005',
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
          url: '',
          iconUrl: '',
          description: '',
        },
        {
          id: 'b',
          name: 'B',
          url: '',
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
          url: '',
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
          url: '',
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
          url: '',
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
          url: '',
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
          url: 'http://localhost:3002',
          iconUrl: '',
          description: '',
          dir: 'robscholey_template-child-nextJS',
          port: 3002,
          envFile: '.env.local',
        },
      ],
    });

    // Validation passes; dev-orchestration fields are intentionally not surfaced
    // on the returned AppConfig — they're for the workspace dev scripts only.
    const [entry] = await loadAppsConfig();
    expect(entry).not.toHaveProperty('dir');
    expect(entry).not.toHaveProperty('port');
    expect(entry).not.toHaveProperty('envFile');
  });

  it('rejects non-string dir', async () => {
    await writeConfig({
      apps: [
        {
          id: 'x',
          name: 'X',
          url: '',
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
          url: '',
          iconUrl: '',
          description: '',
          port: '3000',
        },
      ],
    });
    await expect(loadAppsConfig()).rejects.toThrow(/port/);
  });

  it('substitutes ${VAR} placeholders in URL fields at load time', async () => {
    await writeConfig({
      apps: [
        {
          id: 'admin',
          name: 'Admin',
          url: '${ADMIN_URL}',
          iconUrl: '',
          description: '',
        },
      ],
    });
    process.env.ADMIN_URL = 'http://localhost:3005';
    try {
      const [entry] = await loadAppsConfig();
      expect(entry.url).toBe('http://localhost:3005');
    } finally {
      delete process.env.ADMIN_URL;
    }
  });

  it('throws a pointing error when a URL placeholder is unset', async () => {
    await writeConfig({
      apps: [
        {
          id: 'admin',
          name: 'Admin',
          url: '${ADMIN_URL}',
          iconUrl: '',
          description: '',
        },
      ],
    });
    delete process.env.ADMIN_URL;
    await expect(loadAppsConfig()).rejects.toThrow(/ADMIN_URL/);
  });
});
