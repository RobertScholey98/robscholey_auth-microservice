import { SignJWT, jwtVerify } from 'jose';

export interface JWTPayload {
  sub: string;
  name: string;
  type: 'owner' | 'named' | 'anonymous';
  [key: string]: unknown;
}

function getSigningKey(): Uint8Array {
  const secret = process.env.JWT_SIGNING_SECRET;
  if (!secret) throw new Error('JWT_SIGNING_SECRET is not set');
  return new TextEncoder().encode(secret);
}

function getExpiry(): string {
  const seconds = process.env.JWT_EXPIRY || '3600';
  return `${seconds}s`;
}

export async function signJWT(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(getExpiry())
    .sign(getSigningKey());
}

export async function verifyJWT(
  token: string
): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSigningKey());
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}
