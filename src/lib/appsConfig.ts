import { readFile } from 'node:fs/promises';
import type { Accent, AppTag, ShellTheme, TagVariant } from '@robscholey/contracts';

/** Status variants accepted by the selector-metadata field. */
const STATUS_VARIANTS = ['live', 'dev', 'soon', 'paused'] as const;
/** Theme values accepted on `defaultTheme`. */
const THEMES = ['light', 'dark'] as const;
/** Accent values accepted on `defaultAccent`. */
const ACCENTS = ['teal', 'warm', 'mono', 'rose', 'indigo', 'betway', 'fsgb'] as const;
/** Tag variants accepted on each {@link AppTag}. */
const TAG_VARIANTS = ['default', 'accent', 'warm'] as const satisfies readonly TagVariant[];

/**
 * Matches the id shape the rest of the stack assumes — a lowercase slug safe
 * for URLs, DB keys, and env-var names. Enforced at load time so a typo in
 * `appsConfig.json` fails loudly instead of producing mysterious routing
 * errors further down.
 */
const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

/** A single entry in `appsConfig.json` — structural fields only, no runtime state. */
export interface AppConfig {
  id: string;
  name: string;
  /**
   * Browser-reachable URL for the sub-app. Derived by {@link loadAppsConfig}
   * from `subdomain` + `publicDomain` in production, or from `port` in dev,
   * unless the raw config provides an explicit `url` override (for external
   * apps that live outside this deploy).
   */
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
  /** Tags rendered on the shell selector card. */
  tags?: AppTag[];
  /** Short mono-style marker rendered top-left on the selector card. */
  visualMark?: string;
}

/**
 * Raw entry shape as written in `appsConfig.json` — a superset of
 * {@link AppConfig} that carries the derivation inputs (`port`, `subdomain`)
 * and dev-orchestration fields (`dir`, `envFile`) consumed by scripts. These
 * are intentionally elided from {@link AppConfig} so downstream services
 * can't come to depend on them.
 */
interface RawAppConfig {
  id: string;
  name: string;
  url?: string;
  port?: number;
  subdomain?: string;
  dir?: string;
  envFile?: string;
  iconUrl: string;
  description: string;
  ownerOnly?: boolean;
  defaultTheme?: ShellTheme;
  defaultAccent?: Accent;
  version?: string;
  lastUpdatedAt?: string;
  statusVariant?: (typeof STATUS_VARIANTS)[number];
  visualKey?: string;
  tags?: AppTag[];
  visualMark?: string;
}

/** Context the URL resolver needs to decide between dev and prod derivation. */
interface ResolveContext {
  publicDomain: string;
  isProduction: boolean;
}

let cached: AppConfig[] | null = null;

/**
 * Produces a browser-reachable URL for an app entry.
 *
 * Precedence:
 *   1. Explicit `url` in config — used verbatim. Covers external apps (e.g.
 *      one hosted outside this deploy) that shouldn't be derived.
 *   2. In production: `https://{subdomain ?? id}.{publicDomain}`. Caddy must
 *      be configured to route that subdomain to the backing container.
 *   3. In development: `http://localhost:{port}`. Matches the dev-ports
 *      exposed by `docker-compose.yml` and `scripts/dev.sh`.
 *
 * @param raw - The raw config entry.
 * @param ctx - Public domain + environment hint.
 * @param i - Index into the `apps` array for error messages.
 * @returns The resolved URL as a string.
 * @throws If neither `url` nor `port` is set (nothing to derive).
 */
function resolveUrl(raw: RawAppConfig, ctx: ResolveContext, i: number): string {
  if (raw.url !== undefined && raw.url !== '') return raw.url;
  if (raw.port === undefined) {
    throw new Error(
      `appsConfig.json: apps[${i}] needs either "url" or "port" so a URL can be derived`,
    );
  }
  if (ctx.isProduction) {
    const subdomain = raw.subdomain ?? raw.id;
    return `https://${subdomain}.${ctx.publicDomain}`;
  }
  return `http://localhost:${raw.port}`;
}

function validate(data: unknown, ctx: ResolveContext): AppConfig[] {
  if (typeof data !== 'object' || data === null || !('apps' in data)) {
    throw new Error('appsConfig.json: expected { "publicDomain": "...", "apps": [...] }');
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
    for (const field of ['id', 'name', 'iconUrl', 'description'] as const) {
      if (typeof e[field] !== 'string') {
        throw new Error(`appsConfig.json: apps[${i}].${field} must be a string`);
      }
    }
    if (!ID_PATTERN.test(e.id as string)) {
      throw new Error(
        `appsConfig.json: apps[${i}].id must match ${ID_PATTERN} — got "${String(e.id)}"`,
      );
    }
    if (e.url !== undefined && typeof e.url !== 'string') {
      throw new Error(`appsConfig.json: apps[${i}].url must be a string when set`);
    }
    if (e.subdomain !== undefined && typeof e.subdomain !== 'string') {
      throw new Error(`appsConfig.json: apps[${i}].subdomain must be a string when set`);
    }
    if (e.ownerOnly !== undefined && typeof e.ownerOnly !== 'boolean') {
      throw new Error(`appsConfig.json: apps[${i}].ownerOnly must be a boolean when set`);
    }
    for (const field of ['version', 'lastUpdatedAt', 'visualKey', 'dir', 'envFile'] as const) {
      if (e[field] !== undefined && typeof e[field] !== 'string') {
        throw new Error(`appsConfig.json: apps[${i}].${field} must be a string when set`);
      }
    }
    if (e.port !== undefined && (typeof e.port !== 'number' || !Number.isInteger(e.port))) {
      throw new Error(`appsConfig.json: apps[${i}].port must be an integer when set`);
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
    if (e.tags !== undefined) {
      if (!Array.isArray(e.tags)) {
        throw new Error(`appsConfig.json: apps[${i}].tags must be an array when set`);
      }
      e.tags.forEach((tag, j) => {
        if (typeof tag !== 'object' || tag === null) {
          throw new Error(`appsConfig.json: apps[${i}].tags[${j}] must be an object`);
        }
        const t = tag as Record<string, unknown>;
        if (typeof t.label !== 'string') {
          throw new Error(`appsConfig.json: apps[${i}].tags[${j}].label must be a string`);
        }
        if (
          t.variant !== undefined &&
          !TAG_VARIANTS.includes(t.variant as TagVariant)
        ) {
          throw new Error(
            `appsConfig.json: apps[${i}].tags[${j}].variant must be one of ${TAG_VARIANTS.join(', ')} when set`,
          );
        }
      });
    }
    if (e.visualMark !== undefined && typeof e.visualMark !== 'string') {
      throw new Error(`appsConfig.json: apps[${i}].visualMark must be a string when set`);
    }

    // Fields are field-by-field typechecked above, so the narrowing is safe
    // at runtime — the double-cast satisfies TS's stricter arm.
    const raw = e as unknown as RawAppConfig;
    return {
      id: raw.id,
      name: raw.name,
      url: resolveUrl(raw, ctx, i),
      iconUrl: raw.iconUrl,
      description: raw.description,
      ...(raw.ownerOnly === true ? { ownerOnly: true } : {}),
      ...(raw.defaultTheme !== undefined ? { defaultTheme: raw.defaultTheme } : {}),
      ...(raw.defaultAccent !== undefined ? { defaultAccent: raw.defaultAccent } : {}),
      ...(raw.version !== undefined ? { version: raw.version } : {}),
      ...(raw.lastUpdatedAt !== undefined ? { lastUpdatedAt: raw.lastUpdatedAt } : {}),
      ...(raw.statusVariant !== undefined ? { statusVariant: raw.statusVariant } : {}),
      ...(raw.visualKey !== undefined ? { visualKey: raw.visualKey } : {}),
      ...(raw.tags !== undefined ? { tags: raw.tags } : {}),
      ...(raw.visualMark !== undefined ? { visualMark: raw.visualMark } : {}),
    };
  });
}

/**
 * Reads the top-level `publicDomain` string from the raw JSON. Required in
 * production; optional in dev (unused by {@link resolveUrl} for localhost
 * derivation). Throws if the key is present but malformed.
 */
function readPublicDomain(data: unknown, isProduction: boolean): string {
  if (typeof data !== 'object' || data === null || !('publicDomain' in data)) {
    if (isProduction) {
      throw new Error(
        'appsConfig.json: "publicDomain" is required when NODE_ENV=production (e.g. "robscholey.com")',
      );
    }
    return '';
  }
  const { publicDomain } = data as { publicDomain: unknown };
  if (typeof publicDomain !== 'string' || publicDomain === '') {
    throw new Error('appsConfig.json: "publicDomain" must be a non-empty string when set');
  }
  return publicDomain;
}

/**
 * Loads and validates the apps config from `APPS_CONFIG_PATH`. URL fields are
 * derived from `subdomain` + top-level `publicDomain` (prod) or `port` (dev)
 * so one file drives every environment without per-environment forks. An
 * explicit `url` overrides derivation for external apps.
 *
 * Throws if the env var is unset, the file is missing, the shape is wrong,
 * a URL can't be derived, or `publicDomain` is missing in production.
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
  const isProduction = process.env.NODE_ENV === 'production';
  const publicDomain = readPublicDomain(parsed, isProduction);
  cached = validate(parsed, { publicDomain, isProduction });
  return cached;
}

/** Clears the cached config. Test-only helper. */
export function _testReset(): void {
  cached = null;
}
