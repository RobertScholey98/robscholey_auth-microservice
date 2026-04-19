import type { GetAnalyticsQuery } from '@robscholey/contracts';
import type { Database } from '@/lib';
import type { AccessLog } from '@/types';

/**
 * Domain-shaped analytics result. Dates stay as `Date` objects; the handler
 * wire-maps the `logs` array via `accessLogToWire` before serialising the
 * response so the mapping policy stays uniform across every list endpoint.
 */
export interface AnalyticsResult {
  logs: AccessLog[];
  stats: {
    totalAccesses: number;
    uniqueSessions: number;
    appBreakdown: Record<string, number>;
  };
}

/**
 * Factory for the analytics service. Fetches access logs through the repo,
 * filters by optional date range, and aggregates per-app + unique-session
 * counts.
 *
 * @param db - The {@link Database} facade this service operates against.
 * @returns An analytics service bound to `db`.
 */
export function createAnalyticsService(db: Database) {
  return {
    /**
     * Returns filtered + aggregated analytics in domain form (dates stay as
     * `Date` objects). The handler maps `logs` to the wire shape.
     *
     * @param query - Optional filters (codeId, appId, from, to).
     */
    async query(query: GetAnalyticsQuery): Promise<AnalyticsResult> {
      const fromDate = query.from ? new Date(query.from) : undefined;
      const toDate = query.to ? new Date(query.to) : undefined;

      const allLogs = await db.accessLogs.query({
        codeId: query.codeId,
        appId: query.appId,
      });

      const uniqueSessions = new Set<string>();
      const appBreakdown: Record<string, number> = {};
      const filtered = allLogs.filter((log) => {
        if (fromDate && log.accessedAt < fromDate) return false;
        if (toDate && log.accessedAt > toDate) return false;
        uniqueSessions.add(log.sessionToken);
        appBreakdown[log.appId] = (appBreakdown[log.appId] ?? 0) + 1;
        return true;
      });

      return {
        logs: filtered,
        stats: {
          totalAccesses: filtered.length,
          uniqueSessions: uniqueSessions.size,
          appBreakdown,
        },
      };
    },
  };
}

/** Public type of the analytics service. */
export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
