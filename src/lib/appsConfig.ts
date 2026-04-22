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

/** Context the URL resolver needs to derive iframe URLs for each app. */
interface ResolveContext {
  /**
   * The origin users' browsers see for the platform — the URL the shell is
   * served at. Everything else (auth, sub-apps) must be reachable from that
   * same network vantage, so we derive their URLs by transforming this.
   */
  publicOrigin: URL;
  /**
   * `true` when `publicOrigin` is port-based (localhost, 127.0.0.1, or an
   * IPv4 literal) — no reverse proxy is expected to be routing subdomains.
   * iframe URLs are same-host-different-port instead.
   */
  isPortBased: boolean;
}

let cached: AppConfig[] | null = null;

/**
 * Tests whether a hostname is port-based (localhost / 127.0.0.1 / IPv4
 * literal). Used by the URL resolver to decide between port-based and
 * subdomain-based iframe URL derivation.
 */
function isPortBasedHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1') return true;
  // IPv4 literal — anything else with dots is assumed to be a proper domain.
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/**
 * Produces a browser-reachable URL for an app entry.
 *
 * Precedence:
 *   1. Explicit `url` in config — used verbatim. Covers external apps (e.g.
 *      one hosted outside this deploy) that shouldn't be derived.
 *   2. `publicOrigin` is localhost / 127.0.0.1 / an IPv4 literal → port-based
 *      `{scheme}://{host}:{port}` (containerised dev on localhost, LAN
 *      testing from a phone, host dev, etc. — no reverse proxy in the mix).
 *   3. Otherwise → subdomain-based `{scheme}://{subdomain ?? id}.{hostname}`.
 *      Caddy (or another reverse proxy fronting the shell's public origin)
 *      must be configured to route that subdomain to the backing container.
 *
 * @param raw - The raw config entry.
 * @param ctx - Resolved public origin + port-vs-subdomain hint.
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
  const { publicOrigin, isPortBased } = ctx;
  if (isPortBased) {
    return `${publicOrigin.protocol}//${publicOrigin.hostname}:${raw.port}`;
  }
  const subdomain = raw.subdomain ?? raw.id;
  return `${publicOrigin.protocol}//${subdomain}.${publicOrigin.hostname}`;
}

function validate(data: unknown, ctx: ResolveContext): AppConfig[] {
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
 * Parses `PUBLIC_ORIGIN` into a URL object. This is the origin users'
 * browsers see for the platform — the URL the shell is served at. Auth
 * uses it to derive iframe URLs for sub-apps (same-host-different-port on
 * localhost, subdomain-based otherwise). Optional; defaults to
 * `http://localhost:3000` when unset so host-dev boots without a fuss.
 */
function readPublicOrigin(): URL {
  const raw = process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000';
  try {
    return new URL(raw);
  } catch {
    throw new Error(
      `PUBLIC_ORIGIN must be a valid URL (e.g. https://robscholey.com). Got: "${raw}"`,
    );
  }
}

/**
 * Loads and validates the apps config from `APPS_CONFIG_PATH`. URL fields are
 * derived from `PUBLIC_ORIGIN` — localhost/IP hosts produce port-based URLs
 * (`http://<host>:<port>`), proper domains produce subdomain-based URLs
 * (`https://{subdomain ?? id}.<domain>`) so one file drives every
 * environment. An explicit `url` on an entry overrides derivation for
 * external apps.
 *
 * Throws if the config file is missing, the shape is wrong, a URL can't be
 * derived, or `PUBLIC_ORIGIN` is malformed. Caches on first read — call
 * {@link _testReset} to clear.
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
  const publicOrigin = readPublicOrigin();
  const isPortBased = isPortBasedHost(publicOrigin.hostname);
  cached = validate(parsed, { publicOrigin, isPortBased });
  return cached;
}

/** Clears the cached config. Test-only helper. */
export function _testReset(): void {
  cached = null;
}
