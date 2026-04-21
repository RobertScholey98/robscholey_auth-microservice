import type { StreamEvent } from '@robscholey/contracts';

/** A listener subscribed to the {@link EventsBus}. */
export type EventsListener = (event: StreamEvent) => void;

/**
 * In-process publish/subscribe bus used to fan typed domain events out to
 * long-lived subscribers — principally the SSE stream handler at
 * `GET /admin/stream`.
 *
 * The bus is deliberately a single fan-out channel: every listener receives
 * every event. It&rsquo;s the stream handler&rsquo;s job to filter for the
 * client it&rsquo;s serving. At the current scale — one owner, a handful of
 * admin tabs — that&rsquo;s orders of magnitude cheaper than per-topic
 * routing and keeps the API surface trivially testable.
 *
 * The bus only lives for the lifetime of the Hono app; restarting the auth
 * service drops in-flight deliveries. That&rsquo;s fine for presence and
 * audit events (the next page load resyncs from Postgres); chat messages
 * persist in the DB before the emit so the client reconnects and re-fetches.
 */
export interface EventsBus {
  /** Synchronously delivers the event to every current subscriber. */
  emit(event: StreamEvent): void;
  /** Registers a listener; returns an unsubscribe function. */
  subscribe(listener: EventsListener): () => void;
}

/**
 * Creates a fresh in-memory {@link EventsBus}. One per {@link createApp}
 * invocation — never a module-level singleton, so tests can build isolated
 * app instances without cross-test leakage.
 */
export function createEventsBus(): EventsBus {
  const listeners = new Set<EventsListener>();

  return {
    emit(event) {
      // Iterate a copy so a subscriber that unsubscribes inside its own
      // listener doesn&rsquo;t mutate the set we&rsquo;re walking.
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
