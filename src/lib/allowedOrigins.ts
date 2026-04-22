import type { AppConfig } from './appsConfig';

/**
 * Builds the set of origins permitted by auth's CORS middleware. Two sources:
 *
 *   1. `publicOrigin` — the shell itself. Always included.
 *   2. Each app in {@link AppConfig}. The URL derivation already produced
 *      browser-reachable URLs (port-based in dev, subdomain-based in prod)
 *      so parsing each one's origin gives exactly the set of clients that
 *      can legitimately hit auth.
 *
 * Optional `extraOrigins` — parsed from a comma-separated env override —
 * covers edge cases (alternate dev origins, a standalone tool, etc.)
 * without forcing a config edit. Invalid URLs in any source are dropped
 * with no error; a misconfigured entry can't block boot.
 *
 * @param publicOrigin - The shell's public origin.
 * @param apps - Loaded app configs whose URLs have already been resolved.
 * @param extraOrigins - Optional raw comma-separated string from
 *   `ALLOWED_ORIGINS`. Each entry is trimmed.
 * @returns An array of allowed origin strings (deduplicated).
 */
export function buildAllowedOrigins(
  publicOrigin: URL,
  apps: AppConfig[],
  extraOrigins: string | undefined,
): string[] {
  const origins = new Set<string>();
  origins.add(publicOrigin.origin);

  for (const app of apps) {
    try {
      origins.add(new URL(app.url).origin);
    } catch {
      // Malformed app URL — skip. Validation caught most cases; this is a
      // belt-and-braces against an explicit `url` override that's not a URL.
    }
  }

  if (extraOrigins) {
    for (const raw of extraOrigins.split(',')) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      try {
        origins.add(new URL(trimmed).origin);
      } catch {
        // Skip malformed entries in the env override.
      }
    }
  }

  return [...origins];
}
