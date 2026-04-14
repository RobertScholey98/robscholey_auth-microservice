import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from '../password';

describe('password', () => {
  it('hashes a password and verifies it', async () => {
    const hash = await hashPassword('test123');
    expect(hash).not.toBe('test123');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await comparePassword('test123', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('test123');
    expect(await comparePassword('wrong', hash)).toBe(false);
  });

  it('produces different hashes for the same password', async () => {
    const hash1 = await hashPassword('test123');
    const hash2 = await hashPassword('test123');
    expect(hash1).not.toBe(hash2);
  });
});
