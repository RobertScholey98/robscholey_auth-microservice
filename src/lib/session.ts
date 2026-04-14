/**
 * Generates a cryptographically random session token with a `sess_` prefix.
 * @returns A unique session token string, e.g. `sess_a1b2c3d4-...`.
 */
export function createSessionToken(): string {
  return `sess_${crypto.randomUUID()}`;
}
