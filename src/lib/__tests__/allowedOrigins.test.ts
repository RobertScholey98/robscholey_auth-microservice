import { describe, it, expect } from 'vitest';
import type { AppConfig } from '../appsConfig';
import { buildAllowedOrigins } from '../allowedOrigins';

function app(overrides: Partial<AppConfig> & Pick<AppConfig, 'url'>): AppConfig {
  return {
    id: 'demo',
    name: 'Demo',
    iconUrl: '',
    description: '',
    ...overrides,
  };
}

describe('buildAllowedOrigins', () => {
  it('includes the public origin', () => {
    const origins = buildAllowedOrigins(new URL('https://robscholey.com'), [], undefined);
    expect(origins).toContain('https://robscholey.com');
  });

  it('includes each app origin, deduped against the public origin', () => {
    const origins = buildAllowedOrigins(
      new URL('https://robscholey.com'),
      [
        app({ url: 'https://admin.robscholey.com' }),
        app({ url: 'https://portfolio.robscholey.com' }),
      ],
      undefined,
    );
    expect(origins.sort()).toEqual(
      [
        'https://robscholey.com',
        'https://admin.robscholey.com',
        'https://portfolio.robscholey.com',
      ].sort(),
    );
  });

  it('strips paths and query from app URLs — only the origin lands in the allowlist', () => {
    const origins = buildAllowedOrigins(
      new URL('https://robscholey.com'),
      [app({ url: 'https://admin.robscholey.com/some/path?q=1' })],
      undefined,
    );
    expect(origins).toContain('https://admin.robscholey.com');
    expect(origins).not.toContain('https://admin.robscholey.com/some/path?q=1');
  });

  it('appends extra origins from the comma-separated override', () => {
    const origins = buildAllowedOrigins(
      new URL('http://localhost:3000'),
      [],
      'http://localhost:3005, https://preview.robscholey.com',
    );
    expect(origins).toContain('http://localhost:3005');
    expect(origins).toContain('https://preview.robscholey.com');
  });

  it('dedupes entries across sources', () => {
    const origins = buildAllowedOrigins(
      new URL('https://robscholey.com'),
      [app({ url: 'https://robscholey.com' })],
      'https://robscholey.com',
    );
    expect(origins.filter((o) => o === 'https://robscholey.com')).toHaveLength(1);
  });

  it('silently drops malformed app URLs', () => {
    const origins = buildAllowedOrigins(
      new URL('https://robscholey.com'),
      [app({ url: 'not a url' })],
      undefined,
    );
    expect(origins).toEqual(['https://robscholey.com']);
  });

  it('silently drops malformed entries in the env override', () => {
    const origins = buildAllowedOrigins(
      new URL('https://robscholey.com'),
      [],
      'https://valid.test, junk, ',
    );
    expect(origins).toContain('https://valid.test');
    expect(origins).not.toContain('junk');
  });

  it('covers the containerised-dev case (localhost origins from port-based derivation)', () => {
    const origins = buildAllowedOrigins(
      new URL('http://localhost:3000'),
      [
        app({ url: 'http://localhost:3002' }),
        app({ url: 'http://localhost:3003' }),
        app({ url: 'http://localhost:3005' }),
      ],
      undefined,
    );
    expect(origins.sort()).toEqual(
      [
        'http://localhost:3000',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:3005',
      ].sort(),
    );
  });
});
