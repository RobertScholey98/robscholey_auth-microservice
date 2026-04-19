import type { Pool } from 'pg';
import type { App } from '@/types';
import { mapApp, type Row } from './mappers';

/** Per-aggregate repository for the apps table. */
export interface AppsRepo {
  /** Returns all registered apps. */
  list(): Promise<App[]>;
  /** Returns a single app by ID, or `null` if not found. */
  get(id: string): Promise<App | null>;
  /** Returns public metadata (name, icon) for an active app, or `null` if not found or inactive. */
  getMeta(id: string): Promise<{ name: string; iconUrl: string } | null>;
  /** Creates a new app record. */
  create(app: App): Promise<App>;
  /** Partially updates an app by ID. Returns the updated app, or `null` if not found. */
  update(id: string, data: Omit<Partial<App>, 'id'>): Promise<App | null>;
  /** Deletes an app by ID. Returns `true` if the app existed. */
  delete(id: string): Promise<boolean>;
}

/**
 * In-memory implementation of {@link AppsRepo} backed by a Map.
 * Data resets on process restart — local-dev only.
 */
export class InMemoryAppsRepo implements AppsRepo {
  private apps = new Map<string, App>();

  /** Clears the repo. Test-only — not on the {@link AppsRepo} interface. */
  _reset(): void {
    this.apps.clear();
  }

  /** Returns all registered apps. */
  async list(): Promise<App[]> {
    return [...this.apps.values()];
  }

  /** Returns a single app by ID, or `null` if not found. */
  async get(id: string): Promise<App | null> {
    return this.apps.get(id) ?? null;
  }

  /** Returns public metadata (name, icon) for an active app, or `null` if not found or inactive. */
  async getMeta(id: string): Promise<{ name: string; iconUrl: string } | null> {
    const app = this.apps.get(id);
    if (!app || !app.active) return null;
    return { name: app.name, iconUrl: app.iconUrl };
  }

  /** Creates a new app record. */
  async create(app: App): Promise<App> {
    this.apps.set(app.id, app);
    return app;
  }

  /** Partially updates an app by ID. Returns the updated app, or `null` if not found. */
  async update(id: string, data: Omit<Partial<App>, 'id'>): Promise<App | null> {
    const app = this.apps.get(id);
    if (!app) return null;
    const updated = { ...app, ...data, id };
    this.apps.set(id, updated);
    return updated;
  }

  /** Deletes an app by ID. Returns `true` if the app existed. */
  async delete(id: string): Promise<boolean> {
    return this.apps.delete(id);
  }
}

/** Postgres-backed implementation of {@link AppsRepo}. */
export class PostgresAppsRepo implements AppsRepo {
  /**
   * @param pool - Shared connection pool.
   */
  constructor(private readonly pool: Pool) {}

  /** Returns all registered apps. */
  async list(): Promise<App[]> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM apps');
    return rows.map(mapApp);
  }

  /** Returns a single app by ID, or `null` if not found. */
  async get(id: string): Promise<App | null> {
    const { rows } = await this.pool.query<Row>('SELECT * FROM apps WHERE id = $1', [id]);
    return rows[0] ? mapApp(rows[0]) : null;
  }

  /** Returns public metadata (name, icon) for an active app, or `null` if not found or inactive. */
  async getMeta(id: string): Promise<{ name: string; iconUrl: string } | null> {
    const { rows } = await this.pool.query<Row>(
      'SELECT name, icon_url FROM apps WHERE id = $1 AND active = TRUE',
      [id],
    );
    if (!rows[0]) return null;
    return { name: rows[0].name as string, iconUrl: rows[0].icon_url as string };
  }

  /** Creates a new app record. */
  async create(app: App): Promise<App> {
    await this.pool.query(
      'INSERT INTO apps (id, name, url, icon_url, description, active) VALUES ($1, $2, $3, $4, $5, $6)',
      [app.id, app.name, app.url, app.iconUrl, app.description, app.active],
    );
    return app;
  }

  /** Partially updates an app by ID. Returns the updated app, or `null` if not found. */
  async update(id: string, data: Omit<Partial<App>, 'id'>): Promise<App | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const merged: App = { ...existing, ...data, id };
    await this.pool.query(
      'UPDATE apps SET name = $2, url = $3, icon_url = $4, description = $5, active = $6 WHERE id = $1',
      [id, merged.name, merged.url, merged.iconUrl, merged.description, merged.active],
    );
    return merged;
  }

  /** Deletes an app by ID. Returns `true` if the app existed. */
  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM apps WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}
