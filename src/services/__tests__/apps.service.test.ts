import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorCode } from '@robscholey/contracts';
import { InMemoryDatabase } from '@/lib/db';
import {
  createAppsService,
  type AppsService,
  type SyncAppsResult,
} from '../apps.service';
import type { AppConfig } from '@/lib/appsConfig';

let db: InMemoryDatabase;
let service: AppsService;

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
  db = new InMemoryDatabase();
  service = createAppsService(db);
});

describe('apps.service.syncFromConfig', () => {
  it('inserts new config entries as inactive', async () => {
    const result: SyncAppsResult = await service.syncFromConfig(config);

    expect(result.synced).toBe(1);
    expect(result.orphans).toEqual([]);

    const apps = await db.apps.list();
    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe('demo');
    expect(apps[0].active).toBe(false);
  });

  it('updates structural fields but preserves active flag', async () => {
    await db.apps.create({ ...config[0], name: 'Old Name', active: true });

    await service.syncFromConfig([{ ...config[0], name: 'New Name' }]);

    const app = await db.apps.get('demo');
    expect(app!.name).toBe('New Name');
    expect(app!.active).toBe(true);
  });

  it('reports orphans without deleting them', async () => {
    await db.apps.create({
      id: 'legacy',
      name: 'Legacy',
      url: 'http://localhost:9999',
      iconUrl: '',
      description: '',
      active: true,
    });

    const result = await service.syncFromConfig(config);

    expect(result.orphans).toEqual(['legacy']);
    expect(await db.apps.get('legacy')).not.toBeNull();
  });

  it('handles an empty config (all DB apps become orphans)', async () => {
    await db.apps.create({
      id: 'a',
      name: 'A',
      url: '',
      iconUrl: '',
      description: '',
      active: false,
    });

    const result = await service.syncFromConfig([]);

    expect(result.synced).toBe(0);
    expect(result.orphans).toEqual(['a']);
  });

  it('inserts ownerOnly entries as active on first sync', async () => {
    await service.syncFromConfig([
      {
        id: 'admin',
        name: 'Admin',
        url: 'http://admin',
        iconUrl: '',
        description: '',
        ownerOnly: true,
      },
    ]);

    const app = await db.apps.get('admin');
    expect(app!.active).toBe(true);
  });

  it('re-activates ownerOnly apps on every sync even if toggled off in the DB', async () => {
    await db.apps.create({
      id: 'admin',
      name: 'Admin',
      url: 'http://admin',
      iconUrl: '',
      description: '',
      active: false,
    });

    await service.syncFromConfig([
      {
        id: 'admin',
        name: 'Admin',
        url: 'http://admin',
        iconUrl: '',
        description: '',
        ownerOnly: true,
      },
    ]);

    const app = await db.apps.get('admin');
    expect(app!.active).toBe(true);
  });
});

describe('apps.service.toggleActive', () => {
  it('throws NotFound for an unknown app', async () => {
    await expect(service.toggleActive('nope', true)).rejects.toMatchObject({
      code: ErrorCode.AdminAppNotFound,
      status: 404,
    });
  });
});

describe('apps.service.removeOrphan', () => {
  it('refuses to delete an app still present in appsConfig.json', async () => {
    // 'in-config' is the fixture app provided by globalSetup.
    await db.apps.create({
      id: 'in-config',
      name: 'In Config',
      url: 'http://localhost:3999',
      iconUrl: '',
      description: '',
      active: true,
    });

    await expect(service.removeOrphan('in-config')).rejects.toMatchObject({
      code: ErrorCode.AdminAppInConfig,
      status: 400,
    });
    expect(await db.apps.get('in-config')).not.toBeNull();
  });

  it('deletes an orphan app', async () => {
    await db.apps.create({
      id: 'legacy',
      name: 'Legacy',
      url: 'http://localhost:9999',
      iconUrl: '',
      description: '',
      active: false,
    });

    await expect(service.removeOrphan('legacy')).resolves.toBeUndefined();
    expect(await db.apps.get('legacy')).toBeNull();
  });
});
