import type { Context } from 'hono';
import { db } from '@/lib';
import { accessLogToWire } from '@/lib/wire';

/**
 * Returns access log entries with optional filtering and aggregated stats.
 * Query params: `codeId`, `appId`, `from` (ISO date), `to` (ISO date).
 */
export async function getAnalytics(c: Context) {
  const codeId = c.req.query('codeId');
  const appId = c.req.query('appId');
  const from = c.req.query('from');
  const to = c.req.query('to');

  const fromDate = from ? new Date(from) : undefined;
  const toDate = to ? new Date(to) : undefined;

  if ((from && isNaN(fromDate!.getTime())) || (to && isNaN(toDate!.getTime()))) {
    return c.json({ error: 'Invalid date format. Use ISO 8601.' }, 400);
  }

  const allLogs = await db.getAccessLogs({
    codeId: codeId || undefined,
    appId: appId || undefined,
  });

  // Single pass: filter by date range and aggregate stats simultaneously.
  // Filtering happens against the domain `Date` object before the wire
  // mapper serialises it, so comparisons stay on the same underlying type.
  const uniqueSessions = new Set<string>();
  const appBreakdown: Record<string, number> = {};
  const filtered = allLogs.filter((log) => {
    if (fromDate && log.accessedAt < fromDate) return false;
    if (toDate && log.accessedAt > toDate) return false;
    uniqueSessions.add(log.sessionToken);
    appBreakdown[log.appId] = (appBreakdown[log.appId] ?? 0) + 1;
    return true;
  });

  return c.json({
    logs: filtered.map(accessLogToWire),
    stats: {
      totalAccesses: filtered.length,
      uniqueSessions: uniqueSessions.size,
      appBreakdown,
    },
  });
}
