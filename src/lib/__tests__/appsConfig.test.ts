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
});
