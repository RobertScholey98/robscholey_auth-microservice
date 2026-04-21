import { describe, it, expect, vi } from 'vitest';
import { createEventsBus } from '@/lib/events';

describe('createEventsBus', () => {
  it('delivers emitted events to every subscriber', () => {
    const bus = createEventsBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);

    bus.emit({ type: 'heartbeat' });

    expect(a).toHaveBeenCalledOnce();
    expect(a).toHaveBeenCalledWith({ type: 'heartbeat' });
    expect(b).toHaveBeenCalledOnce();
  });

  it('returns an unsubscribe function that removes the listener', () => {
    const bus = createEventsBus();
    const listener = vi.fn();
    const unsub = bus.subscribe(listener);

    bus.emit({ type: 'heartbeat' });
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    bus.emit({ type: 'heartbeat' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('tolerates a listener that unsubscribes itself mid-emit', () => {
    const bus = createEventsBus();
    const a = vi.fn();
    const b = vi.fn();

    const unsubA = bus.subscribe(() => {
      a();
      unsubA();
    });
    bus.subscribe(b);

    // First emit fires both; A unsubscribes itself after firing once.
    bus.emit({ type: 'heartbeat' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    // Second emit only hits B.
    bus.emit({ type: 'heartbeat' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('isolates listeners across bus instances', () => {
    const a = createEventsBus();
    const b = createEventsBus();
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    a.subscribe(listenerA);
    b.subscribe(listenerB);

    a.emit({ type: 'heartbeat' });

    expect(listenerA).toHaveBeenCalledOnce();
    expect(listenerB).not.toHaveBeenCalled();
  });
});
