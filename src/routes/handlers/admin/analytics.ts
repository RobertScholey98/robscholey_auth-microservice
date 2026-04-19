import type { Context } from 'hono';
import { getAnalyticsQuerySchema } from '@robscholey/contracts';
import { db } from '@/lib';
import { accessLogToWire } from '@/lib/wire';

/**
 * Returns access log entries with optional filtering and aggregated stats.
 * Query params: `codeId`, `appId`, `from` (ISO 8601 date), `to` (ISO 8601 date).
 */
export async function getAnalytics(c: Context) {
  const query = getAnalyticsQuerySchema.parse(c.req.query());

  const fromDate = query.from ? new Date(query.from) : undefined;
  const toDate = query.to ? new Date(query.to) : undefined;

  const allLogs = await db.getAccessLogs({
    codeId: query.codeId,
    appId: query.appId,
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
