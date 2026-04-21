import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InMemoryDatabase, type Database } from '@/lib';
import {
  createPresenceService,
  classifyPresence,
  LIVE_WINDOW_MS,
  IDLE_WINDOW_MS,
} from '@/services/presence.service';
import type { Session } from '@/types';

const NOW = new Date('2026-05-01T12:00:00Z');

function makeSession(overrides: Partial<Session>): Session {
  return {
    token: overrides.token ?? 'tok',
    userId: overrides.userId ?? null,
    codeId: overrides.codeId ?? null,
    appIds: overrides.appIds ?? ['portfolio'],
    createdAt: overrides.createdAt ?? NOW,
    lastActiveAt: overrides.lastActiveAt ?? NOW,
    expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
  };
}

describe('classifyPresence', () => {
  const now = NOW.getTime();

  it('returns live when the session was active within the live window', () => {
    expect(classifyPresence(now - 60_000, now)).toBe('live');
  });

  it('returns live for sessions with a slightly-in-the-future timestamp (clock skew)', () => {
    expect(classifyPresence(now + 1000, now)).toBe('live');
  });

  it('returns idle when past the live window but within the idle window', () => {
    expect(classifyPresence(now - (LIVE_WINDOW_MS + 1000), now)).toBe('idle');
  });

  it('returns null when past the idle window', () => {
    expect(classifyPresence(now - (IDLE_WINDOW_MS + 1000), now)).toBeNull();
  });
});

describe('createPresenceService', () => {
  let db: Database;

  beforeEach(() => {
    db = new InMemoryDatabase();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('buckets sessions into live and idle based on last_active_at', async () => {
    await db.sessions.create(
      makeSession({ token: 'live-1', lastActiveAt: new Date(NOW.getTime() - 30_000) }),
    );
    await db.sessions.create(
      makeSession({
        token: 'idle-1',
        lastActiveAt: new Date(NOW.getTime() - (LIVE_WINDOW_MS + 30_000)),
      }),
    );
    await db.sessions.create(
      makeSession({
        token: 'off-1',
        lastActiveAt: new Date(NOW.getTime() - (IDLE_WINDOW_MS + 30_000)),
      }),
    );

    const service = createPresenceService(db);
    const snapshot = await service.getSnapshot();

    expect(snapshot.live.map((e) => e.sessionToken)).toEqual(['live-1']);
    expect(snapshot.idle.map((e) => e.sessionToken)).toEqual(['idle-1']);
  });

  it('filters out expired sessions regardless of last_active_at', async () => {
    await db.sessions.create(
      makeSession({
        token: 'expired',
        lastActiveAt: NOW,
        expiresAt: new Date(NOW.getTime() - 1000),
      }),
    );

    const service = createPresenceService(db);
    const snapshot = await service.getSnapshot();

    expect(snapshot.live).toEqual([]);
    expect(snapshot.idle).toEqual([]);
  });

  it('projects session metadata into the PresenceEntry wire shape', async () => {
    await db.sessions.create(
      makeSession({
        token: 'live-sarah',
        userId: 'u-sarah',
        codeId: 'ACME-2026',
        appIds: ['portfolio', 'admin'],
        lastActiveAt: new Date(NOW.getTime() - 10_000),
      }),
    );

    const service = createPresenceService(db);
    const snapshot = await service.getSnapshot();

    expect(snapshot.live).toHaveLength(1);
    expect(snapshot.live[0]).toEqual({
      sessionToken: 'live-sarah',
      userId: 'u-sarah',
      codeId: 'ACME-2026',
      status: 'live',
      lastActiveAt: new Date(NOW.getTime() - 10_000).toISOString(),
      appIds: ['portfolio', 'admin'],
    });
  });
});
