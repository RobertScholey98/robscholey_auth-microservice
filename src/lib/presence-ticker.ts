import type { PresenceEntry, PresenceSnapshot } from '@robscholey/contracts';
import type { EventsBus } from './events';

/** Options accepted by {@link startPresenceTicker}. */
export interface PresenceTickerOptions {
  /** Pulls the current snapshot — typically `() => presenceService.getSnapshot()`. */
  getSnapshot: () => Promise<PresenceSnapshot>;
  /** Bus used to publish `presence-delta` events. */
  events: EventsBus;
  /** Cadence of the tick. Defaults to 30 s. */
  intervalMs?: number;
  /** Optional error sink — defaults to a no-op so a transient DB error doesn&rsquo;t crash the ticker. */
  onError?: (err: unknown) => void;
}

/**
 * Starts a background ticker that computes the presence snapshot on a fixed
 * interval and publishes a `presence-delta` event for every session whose
 * status changed since the last tick — including transitions to `off`
 * (sessions that dropped out of both the live and idle windows).
 *
 * The ticker is owned by whoever calls this function; the returned
 * `stop` runs `clearInterval` so tests and graceful-shutdown paths can
 * release it. Tests should never start this from `createApp` — the
 * background timer would leak across suites and pollute output.
 *
 * @param options - See {@link PresenceTickerOptions}.
 * @returns A no-arg function that stops the ticker.
 */
export function startPresenceTicker(options: PresenceTickerOptions): () => void {
  const interval = options.intervalMs ?? 30_000;
  const onError = options.onError ?? (() => {});
  let lastEntries = new Map<string, PresenceEntry>();

  async function tick() {
    try {
      const snapshot = await options.getSnapshot();
      const nextEntries = new Map<string, PresenceEntry>();

      // live/idle sessions — emit a delta when the status moved or the
      // session is new to the online set.
      for (const entry of [...snapshot.live, ...snapshot.idle]) {
        nextEntries.set(entry.sessionToken, entry);
        const prev = lastEntries.get(entry.sessionToken);
        if (!prev || prev.status !== entry.status) {
          options.events.emit({ type: 'presence-delta', entry });
        }
      }

      // Transitions to off — previously online sessions that aren&rsquo;t in
      // the new snapshot. Emit a synthetic `off` entry so consumers can
      // remove them from their online list.
      for (const [token, prev] of lastEntries) {
        if (!nextEntries.has(token)) {
          options.events.emit({
            type: 'presence-delta',
            entry: { ...prev, status: 'off' },
          });
        }
      }

      lastEntries = nextEntries;
    } catch (err) {
      onError(err);
    }
  }

  const timer = setInterval(() => {
    void tick();
  }, interval);

  return () => {
    clearInterval(timer);
  };
}
