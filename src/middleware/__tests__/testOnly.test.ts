import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { assertTestEndpointsAllowed } from '@/middleware/testOnly';

describe('assertTestEndpointsAllowed', () => {
  const originalEnv = process.env.ENABLE_TEST_ENDPOINTS;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    delete process.env.ENABLE_TEST_ENDPOINTS;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENABLE_TEST_ENDPOINTS;
    } else {
      process.env.ENABLE_TEST_ENDPOINTS = originalEnv;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('returns silently when the flag is unset', () => {
    process.env.NODE_ENV = 'production';
    expect(() => assertTestEndpointsAllowed()).not.toThrow();
  });

  it('returns silently when the flag is set outside production', () => {
    process.env.ENABLE_TEST_ENDPOINTS = '1';
    process.env.NODE_ENV = 'development';
    expect(() => assertTestEndpointsAllowed()).not.toThrow();
  });

  it('throws when the flag is set with NODE_ENV=production', () => {
    process.env.ENABLE_TEST_ENDPOINTS = '1';
    process.env.NODE_ENV = 'production';
    expect(() => assertTestEndpointsAllowed()).toThrow(
      /ENABLE_TEST_ENDPOINTS=1 is set while NODE_ENV=production/,
    );
  });

  it('ignores other truthy values for the flag', () => {
    process.env.ENABLE_TEST_ENDPOINTS = 'true';
    process.env.NODE_ENV = 'production';
    // Only the literal string "1" opts in — so "true" is treated as disabled
    // and the prod guard shouldn&rsquo;t fire.
    expect(() => assertTestEndpointsAllowed()).not.toThrow();
  });
});
