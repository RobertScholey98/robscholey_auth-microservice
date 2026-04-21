import type { MiddlewareHandler } from 'hono';
import { ErrorCode } from '@robscholey/contracts';
import { NotFoundError } from '@/lib';
import type { Env } from '@/index';

/**
 * Gate for routes that must never be reachable in production — the
 * presence-poke endpoint used by the Playwright E2E harness is the first
 * and, for now, only caller.
 *
 * Access is governed by the `ENABLE_TEST_ENDPOINTS` environment variable.
 * Any value other than `"1"` causes the middleware to respond with the
 * canonical `NotFoundError`, so route-scanning from a leaked prod deploy
 * reveals nothing. The flag itself is validated at boot by
 * {@link assertTestEndpointsAllowed} (called from `src/dev.ts`) so a
 * production service refuses to start up with test endpoints enabled.
 */
export const testOnly: MiddlewareHandler<Env> = async (c, next) => {
  if (process.env.ENABLE_TEST_ENDPOINTS !== '1') {
    throw new NotFoundError(ErrorCode.NotFound, 'Not Found');
  }
  await next();
};

/**
 * Boot-time guard. Throws if `ENABLE_TEST_ENDPOINTS=1` is set while
 * `NODE_ENV=production`, so a misconfigured production deploy fails fast
 * rather than silently exposing test-only routes.
 *
 * Call this from the production entrypoint (`src/dev.ts`) before the
 * server starts serving traffic.
 *
 * @throws Error when the combination of env vars is unsafe.
 */
export function assertTestEndpointsAllowed(): void {
  if (process.env.ENABLE_TEST_ENDPOINTS !== '1') return;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ENABLE_TEST_ENDPOINTS=1 is set while NODE_ENV=production. Refusing to start — ' +
        'test-only routes must never be reachable in production.',
    );
  }
}
