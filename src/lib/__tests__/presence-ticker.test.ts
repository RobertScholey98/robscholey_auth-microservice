import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PresenceEntry, PresenceSnapshot, StreamEvent } from '@robscholey/contracts';
import { createEventsBus } from '@/lib/events';
import { startPresenceTicker } from '@/lib/presence-ticker';

function entry(token: string, status: PresenceEntry['status']): PresenceEntry {
  return {
    sessionToken: token,
    userId: null,
    codeId: null,
    status,
    lastActiveAt: '2026-05-01T12:00:00Z',
    appIds: ['portfolio'],
  };
}

describe('startPresenceTicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits presence-delta for a new live session on first tick', async () => {
    const bus = createEventsBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const snapshot: PresenceSnapshot = { live: [entry('s-1', 'live')], idle: [] };
    const stop = startPresenceTicker({
      getSnapshot: () => Promise.resolve(snapshot),
      events: bus,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    stop();

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: 'presence-delta', entry: entry('s-1', 'live') });
  });

  it('does not re-emit when status is unchanged between ticks', async () => {
    const bus = createEventsBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const snapshot: PresenceSnapshot = { live: [entry('s-1', 'live')], idle: [] };
    const stop = startPresenceTicker({
      getSnapshot: () => Promise.resolve(snapshot),
      events: bus,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    stop();

    expect(received).toHaveLength(1);
  });

  it('emits a delta when a session transitions from live to idle', async () => {
    const bus = createEventsBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const snapshots: PresenceSnapshot[] = [
      { live: [entry('s-1', 'live')], idle: [] },
      { live: [], idle: [entry('s-1', 'idle')] },
    ];
    let call = 0;
    const stop = startPresenceTicker({
      getSnapshot: () => Promise.resolve(snapshots[Math.min(call++, snapshots.length - 1)]),
      events: bus,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    stop();

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({ type: 'presence-delta', entry: entry('s-1', 'live') });
    expect(received[1]).toEqual({ type: 'presence-delta', entry: entry('s-1', 'idle') });
  });

  it('emits an off delta when a session drops out of the snapshot entirely', async () => {
    const bus = createEventsBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const snapshots: PresenceSnapshot[] = [
      { live: [entry('s-1', 'live')], idle: [] },
      { live: [], idle: [] },
    ];
    let call = 0;
    const stop = startPresenceTicker({
      getSnapshot: () => Promise.resolve(snapshots[Math.min(call++, snapshots.length - 1)]),
      events: bus,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    stop();

    const lastDelta = received.at(-1);
    expect(lastDelta).toEqual({ type: 'presence-delta', entry: entry('s-1', 'off') });
  });

  it('calls onError and keeps ticking when getSnapshot rejects', async () => {
    const bus = createEventsBus();
    const onError = vi.fn();

    let call = 0;
    const stop = startPresenceTicker({
      getSnapshot: () => {
        call++;
        if (call === 1) return Promise.reject(new Error('db down'));
        return Promise.resolve({ live: [entry('s-1', 'live')], idle: [] });
      },
      events: bus,
      intervalMs: 1000,
      onError,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledOnce();

    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    await vi.advanceTimersByTimeAsync(1000);
    stop();

    expect(received).toEqual([
      { type: 'presence-delta', entry: entry('s-1', 'live') },
    ]);
  });

  it('stops ticking after stop() is called', async () => {
    const bus = createEventsBus();
    const received: StreamEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const stop = startPresenceTicker({
      getSnapshot: () => Promise.resolve({ live: [entry('s-1', 'live')], idle: [] }),
      events: bus,
      intervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(received).toHaveLength(1);
  });
});
