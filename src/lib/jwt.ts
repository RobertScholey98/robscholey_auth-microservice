import { SignJWT, jwtVerify } from 'jose';

/** The payload encoded in JWTs issued by the auth service. */
export interface JWTPayload {
  sub: string;
  name: string;
  type: 'owner' | 'named' | 'anonymous';
  [key: string]: unknown;
}

/**
 * Returns the JWT signing key as a Uint8Array, read from the `JWT_SIGNING_SECRET` env var.
 * @throws If `JWT_SIGNING_SECRET` is not set.
 */
function getSigningKey(): Uint8Array {
  const secret = process.env.JWT_SIGNING_SECRET;
  if (!secret) throw new Error('JWT_SIGNING_SECRET is not set');
  return new TextEncoder().encode(secret);
}

/**
 * Returns the JWT expiry duration as a jose-compatible time string, read from the `JWT_EXPIRY` env var.
 * Defaults to `"3600s"` (1 hour) if not set.
 */
function getExpiry(): string {
  const raw = (process.env.JWT_EXPIRY || '3600').replace(/s$/i, '');
  return `${raw}s`;
}

/**
 * Signs a JWT with the given payload using HS256.
 * @param payload - The claims to encode (sub, name, type).
 * @returns The signed JWT string.
 */
export async function signJWT(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(getExpiry())
    .sign(getSigningKey());
}

/**
 * Verifies a JWT and returns the decoded payload.
 * @param token - The JWT string to verify.
 * @returns The decoded payload, or `null` if the token is invalid, expired, or tampered with.
 */
export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSigningKey());
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}
