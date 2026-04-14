import { describe, it, expect, beforeAll } from 'vitest';
import { signJWT, verifyJWT } from '../jwt';

beforeAll(() => {
  process.env.JWT_SIGNING_SECRET = 'test-secret';
  process.env.JWT_EXPIRY = '3600';
});

describe('JWT', () => {
  it('signs and verifies a token', async () => {
    const token = await signJWT({ sub: 'user-1', name: 'Rob', type: 'owner' });
    expect(typeof token).toBe('string');

    const payload = await verifyJWT(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('user-1');
    expect(payload!.name).toBe('Rob');
    expect(payload!.type).toBe('owner');
  });

  it('returns null for an invalid token', async () => {
    const payload = await verifyJWT('garbage.token.here');
    expect(payload).toBeNull();
  });

  it('returns null for a tampered token', async () => {
    const token = await signJWT({ sub: 'user-1', name: 'Rob', type: 'owner' });
    const tampered = token.slice(0, -5) + 'XXXXX';
    const payload = await verifyJWT(tampered);
    expect(payload).toBeNull();
  });

  it('includes iat and exp claims', async () => {
    const token = await signJWT({ sub: 'user-1', name: 'Rob', type: 'owner' });
    const payload = await verifyJWT(token);
    expect(payload!.iat).toBeDefined();
    expect(payload!.exp).toBeDefined();
    expect(payload!.exp).toBeGreaterThan(payload!.iat as number);
  });
});
