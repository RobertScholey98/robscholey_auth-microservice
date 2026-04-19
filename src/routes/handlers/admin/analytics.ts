import type { Context } from 'hono';
import { getAnalyticsQuerySchema, type AnalyticsResponse } from '@robscholey/contracts';
import { accessLogToWire } from '@/lib/wire';
import type { Env } from '@/index';

/**
 * Returns access log entries with optional filtering and aggregated stats.
 * Query params: `codeId`, `appId`, `from` (ISO 8601 date), `to` (ISO 8601 date).
 */
export async function getAnalytics(c: Context<Env>) {
  const query = getAnalyticsQuerySchema.parse(c.req.query());
  const result = await c.get('services').analytics.query(query);
  const response: AnalyticsResponse = {
    logs: result.logs.map(accessLogToWire),
    stats: result.stats,
  };
  return c.json(response);
}
