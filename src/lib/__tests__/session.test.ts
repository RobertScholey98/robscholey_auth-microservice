import { describe, it, expect } from 'vitest';
import { createSessionToken } from '../session';

describe('createSessionToken', () => {
  it('returns a string starting with sess_', () => {
    const token = createSessionToken();
    expect(token).toMatch(/^sess_[0-9a-f-]{36}$/);
  });

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => createSessionToken()));
    expect(tokens.size).toBe(100);
  });
});
