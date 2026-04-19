import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDB } from '../db';
import { syncApps } from '../appsSync';
import type { AppConfig } from '../appsConfig';

let db: InMemoryDB;

const config: AppConfig[] = [
  {
    id: 'demo',
    name: 'Demo',
    url: 'http://localhost:3002',
    iconUrl: '',
    description: 'Demo app',
  },
];

beforeEach(() => {
  db = new InMemoryDB();
});

describe('syncApps', () => {
  it('inserts new config entries as inactive', async () => {
    const result = await syncApps(db, config);

    expect(result.synced).toBe(1);
    expect(result.orphans).toEqual([]);

    const apps = await db.getApps();
    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe('demo');
    expect(apps[0].active).toBe(false);
  });

  it('updates structural fields but preserves active flag', async () => {
    await db.createApp({ ...config[0], name: 'Old Name', active: true });

    await syncApps(db, [{ ...config[0], name: 'New Name' }]);

    const app = await db.getApp('demo');
    expect(app!.name).toBe('New Name');
    expect(app!.active).toBe(true);
  });

  it('reports orphans without deleting them', async () => {
    await db.createApp({
      id: 'legacy',
      name: 'Legacy',
      url: 'http://localhost:9999',
      iconUrl: '',
      description: '',
      active: true,
    });

    const result = await syncApps(db, config);

    expect(result.orphans).toEqual(['legacy']);
    expect(await db.getApp('legacy')).not.toBeNull();
  });

  it('handles an empty config (all DB apps become orphans)', async () => {
    await db.createApp({
      id: 'a',
      name: 'A',
      url: '',
      iconUrl: '',
      description: '',
      active: false,
    });

    const result = await syncApps(db, []);

    expect(result.synced).toBe(0);
    expect(result.orphans).toEqual(['a']);
  });

  it('inserts ownerOnly entries as active on first sync', async () => {
    await syncApps(db, [
      {
        id: 'admin',
        name: 'Admin',
        url: 'http://admin',
        iconUrl: '',
        description: '',
        ownerOnly: true,
      },
    ]);

    const app = await db.getApp('admin');
    expect(app!.active).toBe(true);
  });

  it('re-activates ownerOnly apps on every sync even if toggled off in the DB', async () => {
    await db.createApp({
      id: 'admin',
      name: 'Admin',
      url: 'http://admin',
      iconUrl: '',
      description: '',
      active: false,
    });

    await syncApps(db, [
      {
        id: 'admin',
        name: 'Admin',
        url: 'http://admin',
        iconUrl: '',
        description: '',
        ownerOnly: true,
      },
    ]);

    const app = await db.getApp('admin');
    expect(app!.active).toBe(true);
  });
});
