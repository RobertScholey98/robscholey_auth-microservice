import type { Context } from 'hono';
import { ErrorCode } from '@robscholey/contracts';
import { db, NotFoundError } from '@/lib';

/** Returns public metadata (name, icon URL) for an active app by slug. No auth required. */
export async function getAppMeta(c: Context) {
  const slug = c.req.param('slug')!;
  const meta = await db.getAppMeta(slug);
  if (!meta) {
    throw new NotFoundError(ErrorCode.NotFound, 'App not found');
  }

  return c.json(meta);
}

/** Serves the app icon for a given slug. Returns a placeholder for now. */
export async function getAppIcon(c: Context) {
  const slug = c.req.param('slug')!;
  const meta = await db.getAppMeta(slug);
  if (!meta) {
    throw new NotFoundError(ErrorCode.NotFound, 'App not found');
  }

  // Placeholder: return a simple SVG with the app's first letter
  const letter = meta.name
    .charAt(0)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '?');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="32" fill="#1a1a1a"/>
  <text x="96" y="96" font-family="system-ui, sans-serif" font-size="96" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${letter}</text>
</svg>`;

  /** One hour in seconds — app icons are served as immutable placeholders today. */
  const ICON_CACHE_MAX_AGE = 3600;
  return c.body(svg, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': `public, max-age=${ICON_CACHE_MAX_AGE}`,
  });
}
