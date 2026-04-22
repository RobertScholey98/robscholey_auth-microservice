import { readFile } from 'node:fs/promises';
import type { Accent, ShellTheme } from '@robscholey/contracts';

/** Status variants accepted by the selector-metadata field. */
const STATUS_VARIANTS = ['live', 'dev', 'soon', 'paused'] as const;
/** Theme values accepted on `defaultTheme`. */
const THEMES = ['light', 'dark'] as const;
/** Accent values accepted on `defaultAccent`. */
const ACCENTS = ['teal', 'warm', 'mono', 'rose', 'indigo', 'betway', 'fsgb'] as const;

/**
 * Matches `${VAR_NAME}` placeholders inside string values. Supports plain
 * `A-Z 0-9 _` identifiers — broad enough for the environment variable names
 * we use, tight enough to stay out of punctuation that belongs in URLs.
 */
const ENV_REF_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

/**
 * Substitutes `${VAR}` placeholders with the value of the matching env var.
 * Unset vars throw so misconfiguration fails loudly at boot rather than
 * silently resolving to `undefined`. No-ops on strings without placeholders.
 *
 * @param value - The raw string, typically an entry URL from `appsConfig.json`.
 * @param field - Diagnostic label used in the thrown message.
 * @returns The resolved string with all placeholders substituted.
 * @throws If any referenced env var is unset.
 */
function substituteEnv(value: string, field: string): string {
  return value.replace(ENV_REF_PATTERN, (_match, name: string) => {
    const resolved = process.env[name];
    if (resolved === undefined || resolved === '') {
      throw new Error(
        `appsConfig.json: ${field} references \${${name}} but that env var is unset`,
      );
    }
    return resolved;
  });
}

/** A single entry in `appsConfig.json` — structural fields only, no runtime state. */
export interface AppConfig {
  id: string;
  name: string;
  url: string;
  iconUrl: string;
  description: string;
  /** When true, the app is hidden from non-owner users in shell-facing responses. */
  ownerOnly?: boolean;
  /**
   * Default theme an app's SSR layout renders. Optional in config; defaults
   * to `'dark'` on insert. Once written to the DB, admin edits in the
   * dashboard are preserved across re-syncs (see `apps.service.syncFromConfig`).
   */
  defaultTheme?: ShellTheme;
  /**
   * Default accent an app's SSR layout renders. Optional in config; defaults
   * to `'teal'` on insert. Same insert-only treatment as {@link defaultTheme}.
   */
  defaultAccent?: Accent;
  /** Display-only version string surfaced by the shell selector (e.g. `0.3.0`). */
  version?: string;
  /** ISO 8601 timestamp of the app's last meaningful update. */
  lastUpdatedAt?: string;
  /** Lifecycle hint consumed by the shell selector. */
  statusVariant?: (typeof STATUS_VARIANTS)[number];
  /** Opaque key the shell maps to a local visual component. */
  visualKey?: string;
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
    if (e.ownerOnly !== undefined && typeof e.ownerOnly !== 'boolean') {
      throw new Error(`appsConfig.json: apps[${i}].ownerOnly must be a boolean when set`);
    }
    for (const field of ['version', 'lastUpdatedAt', 'visualKey'] as const) {
      if (e[field] !== undefined && typeof e[field] !== 'string') {
        throw new Error(`appsConfig.json: apps[${i}].${field} must be a string when set`);
      }
    }
    if (e.lastUpdatedAt !== undefined && Number.isNaN(Date.parse(e.lastUpdatedAt as string))) {
      throw new Error(
        `appsConfig.json: apps[${i}].lastUpdatedAt must be an ISO 8601 timestamp when set`,
      );
    }
    if (
      e.statusVariant !== undefined &&
      !STATUS_VARIANTS.includes(e.statusVariant as (typeof STATUS_VARIANTS)[number])
    ) {
      throw new Error(
        `appsConfig.json: apps[${i}].statusVariant must be one of ${STATUS_VARIANTS.join(', ')} when set`,
      );
    }
    if (
      e.defaultTheme !== undefined &&
      !THEMES.includes(e.defaultTheme as (typeof THEMES)[number])
    ) {
      throw new Error(
        `appsConfig.json: apps[${i}].defaultTheme must be one of ${THEMES.join(', ')} when set`,
      );
    }
    if (
      e.defaultAccent !== undefined &&
      !ACCENTS.includes(e.defaultAccent as (typeof ACCENTS)[number])
    ) {
      throw new Error(
        `appsConfig.json: apps[${i}].defaultAccent must be one of ${ACCENTS.join(', ')} when set`,
      );
    }
    return {
      id: e.id as string,
      name: e.name as string,
      url: substituteEnv(e.url as string, `apps[${i}].url`),
      iconUrl: e.iconUrl as string,
      description: e.description as string,
      ...(e.ownerOnly === true ? { ownerOnly: true } : {}),
      ...(e.defaultTheme !== undefined ? { defaultTheme: e.defaultTheme as ShellTheme } : {}),
      ...(e.defaultAccent !== undefined ? { defaultAccent: e.defaultAccent as Accent } : {}),
      ...(e.version !== undefined ? { version: e.version as string } : {}),
      ...(e.lastUpdatedAt !== undefined ? { lastUpdatedAt: e.lastUpdatedAt as string } : {}),
      ...(e.statusVariant !== undefined
        ? { statusVariant: e.statusVariant as (typeof STATUS_VARIANTS)[number] }
        : {}),
      ...(e.visualKey !== undefined ? { visualKey: e.visualKey as string } : {}),
    };
  });
}

/**
 * Loads and validates the apps config from `APPS_CONFIG_PATH`. URL fields may
 * contain `${ENV_VAR}` placeholders — they&rsquo;re resolved against
 * `process.env` at load time so the same file can drive dev, docker-dev, and
 * prod deployments without per-environment forks.
 *
 * Throws if the env var is unset, the file is missing, the shape is wrong,
 * or a URL placeholder references an undefined env var. Caches on first
 * read — call {@link _testReset} to clear.
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
