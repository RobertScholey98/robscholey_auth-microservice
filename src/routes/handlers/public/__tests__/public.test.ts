import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import app from '@/index';
import { db } from '@/lib';

beforeAll(() => {
  process.env.JWT_SIGNING_SECRET = 'test-secret';
  process.env.JWT_EXPIRY = '3600';
  process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
});

beforeEach(() => {
  db._testReset();
});

describe('GET /api/apps/:slug/meta', () => {
  it('returns metadata for an active app', async () => {
    await db.createApp({
      id: 'portfolio',
      name: 'Portfolio',
      url: 'https://portfolio.vercel.app',
      iconUrl: '/icons/portfolio.png',
      description: 'My portfolio',
      active: true,
    });

    const res = await app.request('/api/apps/portfolio/meta');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.name).toBe('Portfolio');
    expect(body.iconUrl).toBe('/icons/portfolio.png');
  });

  it('returns 404 for nonexistent app', async () => {
    const res = await app.request('/api/apps/nope/meta');
    expect(res.status).toBe(404);
  });

  it('returns 404 for inactive app', async () => {
    await db.createApp({
      id: 'hidden',
      name: 'Hidden',
      url: 'https://hidden.vercel.app',
      iconUrl: '',
      description: '',
      active: false,
    });

    const res = await app.request('/api/apps/hidden/meta');
    expect(res.status).toBe(404);
  });

  it('does not require authentication', async () => {
    await db.createApp({
      id: 'portfolio',
      name: 'Portfolio',
      url: 'https://portfolio.vercel.app',
      iconUrl: '',
      description: '',
      active: true,
    });

    // No Authorization header
    const res = await app.request('/api/apps/portfolio/meta');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/app-icon/:slug', () => {
  it('returns an SVG placeholder icon for an active app', async () => {
    await db.createApp({
      id: 'portfolio',
      name: 'Portfolio',
      url: 'https://portfolio.vercel.app',
      iconUrl: '',
      description: '',
      active: true,
    });

    const res = await app.request('/api/app-icon/portfolio');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');

    const body = await res.text();
    expect(body).toContain('<svg');
    expect(body).toContain('>P</text>');
  });

  it('returns 404 for nonexistent app', async () => {
    const res = await app.request('/api/app-icon/nope');
    expect(res.status).toBe(404);
  });

  it('returns 404 for inactive app', async () => {
    await db.createApp({
      id: 'hidden',
      name: 'Hidden',
      url: 'https://hidden.vercel.app',
      iconUrl: '',
      description: '',
      active: false,
    });

    const res = await app.request('/api/app-icon/hidden');
    expect(res.status).toBe(404);
  });
});
