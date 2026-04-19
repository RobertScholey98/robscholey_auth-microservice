import { readFile } from 'node:fs/promises';

/** A single entry in `appsConfig.json` — structural fields only, no runtime state. */
export interface AppConfig {
  id: string;
  name: string;
  url: string;
  iconUrl: string;
  description: string;
}

let cached: AppConfig[] | null = null;

function validate(data: unknown): AppConfig[] {
  if (typeof data !== 'object' || data === null || !('apps' in data)) {
    throw new Error('appsConfig.json: expected { "apps": [...] }');
  }
  const { apps } = data as { apps: unknown };
  if (!Array.isArray(apps)) {
    throw new Error('appsConfig.json: "apps" must be an array');
  }
  return apps.map((entry, i) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`appsConfig.json: apps[${i}] must be an object`);
    }
    const e = entry as Record<string, unknown>;
    for (const field of ['id', 'name', 'url', 'iconUrl', 'description'] as const) {
      if (typeof e[field] !== 'string') {
        throw new Error(`appsConfig.json: apps[${i}].${field} must be a string`);
      }
    }
    return {
      id: e.id as string,
      name: e.name as string,
      url: e.url as string,
      iconUrl: e.iconUrl as string,
      description: e.description as string,
    };
  });
}

/**
 * Loads and validates the apps config from `APPS_CONFIG_PATH`.
 * Throws if the env var is unset, the file is missing, or the shape is wrong.
 * Caches on first read — call {@link _testReset} to clear.
 */
export async function loadAppsConfig(): Promise<AppConfig[]> {
  if (cached) return cached;

  const path = process.env.APPS_CONFIG_PATH;
  if (!path) {
    throw new Error(
      'APPS_CONFIG_PATH is required. Set it to the absolute path of appsConfig.json.',
    );
  }

  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw);
  cached = validate(parsed);
  return cached;
}

/** Clears the cached config. Test-only helper. */
export function _testReset(): void {
  cached = null;
}
