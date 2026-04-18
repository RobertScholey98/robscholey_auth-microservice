import type { App, User, AccessCode, Session, AccessLog } from '@/types';

/** Abstract database interface. All data operations go through this contract, making the storage backend swappable. */
export interface DB {
  /** Returns all registered apps. */
  getApps(): Promise<App[]>;
  /** Returns a single app by ID, or `null` if not found. */
  getApp(id: string): Promise<App | null>;
  /** Returns public metadata (name, icon) for an active app, or `null` if not found or inactive. */
  getAppMeta(id: string): Promise<{ name: string; iconUrl: string } | null>;
  /** Creates a new app record. */
  createApp(app: App): Promise<App>;
  /** Partially updates an app by ID. Returns the updated app, or `null` if not found. */
  updateApp(id: string, data: Omit<Partial<App>, 'id'>): Promise<App | null>;
  /** Deletes an app by ID. Returns `true` if the app existed. */
  deleteApp(id: string): Promise<boolean>;

  /** Returns all users. */
  getUsers(): Promise<User[]>;
  /** Returns a single user by ID, or `null` if not found. */
  getUser(id: string): Promise<User | null>;
  /** Returns a user by their username, or `null` if not found. */
  getUserByUsername(username: string): Promise<User | null>;
  /** Creates a new user record. */
  createUser(user: User): Promise<User>;
  /** Partially updates a user by ID. Returns the updated user, or `null` if not found. */
  updateUser(id: string, data: Omit<Partial<User>, 'id'>): Promise<User | null>;
  /** Deletes a user by ID. Returns `true` if the user existed. */
  deleteUser(id: string): Promise<boolean>;

  /** Returns all access codes. */
  getCodes(): Promise<AccessCode[]>;
  /** Returns a single access code by its code string, or `null` if not found. */
  getCode(code: string): Promise<AccessCode | null>;
  /** Returns all access codes belonging to a specific user. */
  getCodesByUser(userId: string): Promise<AccessCode[]>;
  /** Creates a new access code record. */
  createCode(code: AccessCode): Promise<AccessCode>;
  /** Partially updates an access code. Returns the updated code, or `null` if not found. */
  updateCode(code: string, data: Omit<Partial<AccessCode>, 'code'>): Promise<AccessCode | null>;
  /** Deletes an access code. Returns `true` if the code existed. */
  deleteCode(code: string): Promise<boolean>;

  /** Returns all sessions. */
  getSessions(): Promise<Session[]>;
  /** Returns a single session by token, or `null` if not found. */
  getSession(token: string): Promise<Session | null>;
  /** Returns all sessions created from a specific access code. */
  getSessionsByCode(codeId: string): Promise<Session[]>;
  /** Returns all sessions belonging to a specific user. */
  getSessionsByUser(userId: string): Promise<Session[]>;
  /** Creates a new session record. */
  createSession(session: Session): Promise<Session>;
  /** Partially updates a session by token. Returns the updated session, or `null` if not found. */
  updateSession(token: string, data: Omit<Partial<Session>, 'token'>): Promise<Session | null>;
  /** Deletes a session by token. Returns `true` if the session existed. */
  deleteSession(token: string): Promise<boolean>;

  /** Appends an access log entry. */
  logAccess(log: AccessLog): Promise<void>;
  /** Returns access log entries matching the given filters. An empty filter object returns all entries. */
  getAccessLogs(filters: {
    codeId?: string;
    sessionToken?: string;
    appId?: string;
  }): Promise<AccessLog[]>;

  /** Clears all data. Test-only — implementations should truncate all storage. */
  _testReset(): Promise<void>;
}

/**
 * In-memory implementation of the {@link DB} interface using Maps.
 * Data resets on process restart. Intended for local development only —
 * swap to a persistent implementation (Vercel KV, Postgres) for production.
 */
export class InMemoryDB implements DB {
  private apps = new Map<string, App>();
  private users = new Map<string, User>();
  private codes = new Map<string, AccessCode>();
  private sessions = new Map<string, Session>();
  private accessLogs: AccessLog[] = [];

  /** Clears all data. Test-only helper. */
  async _testReset(): Promise<void> {
    this.apps.clear();
    this.users.clear();
    this.codes.clear();
    this.sessions.clear();
    this.accessLogs = [];
  }

  /** Returns all registered apps. */
  async getApps(): Promise<App[]> {
    return [...this.apps.values()];
  }

  /** Returns a single app by ID, or `null` if not found. */
  async getApp(id: string): Promise<App | null> {
    return this.apps.get(id) ?? null;
  }

  /** Returns public metadata (name, icon) for an active app, or `null` if not found or inactive. */
  async getAppMeta(id: string): Promise<{ name: string; iconUrl: string } | null> {
    const app = this.apps.get(id);
    if (!app || !app.active) return null;
    return { name: app.name, iconUrl: app.iconUrl };
  }

  /** Creates a new app record. */
  async createApp(app: App): Promise<App> {
    this.apps.set(app.id, app);
    return app;
  }

  /** Partially updates an app by ID. Returns the updated app, or `null` if not found. */
  async updateApp(id: string, data: Omit<Partial<App>, 'id'>): Promise<App | null> {
    const app = this.apps.get(id);
    if (!app) return null;
    const updated = { ...app, ...data, id };
    this.apps.set(id, updated);
    return updated;
  }

  /** Deletes an app by ID. Returns `true` if the app existed. */
  async deleteApp(id: string): Promise<boolean> {
    return this.apps.delete(id);
  }

  /** Returns all users. */
  async getUsers(): Promise<User[]> {
    return [...this.users.values()];
  }

  /** Returns a single user by ID, or `null` if not found. */
  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  /** Returns a user by their username, or `null` if not found. */
  async getUserByUsername(username: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.username === username) return user;
    }
    return null;
  }

  /** Creates a new user record. */
  async createUser(user: User): Promise<User> {
    this.users.set(user.id, user);
    return user;
  }

  /** Partially updates a user by ID. Returns the updated user, or `null` if not found. */
  async updateUser(id: string, data: Omit<Partial<User>, 'id'>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...data, id };
    this.users.set(id, updated);
    return updated;
  }

  /** Deletes a user by ID. Returns `true` if the user existed. */
  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  /** Returns all access codes. */
  async getCodes(): Promise<AccessCode[]> {
    return [...this.codes.values()];
  }

  /** Returns a single access code by its code string, or `null` if not found. */
  async getCode(code: string): Promise<AccessCode | null> {
    return this.codes.get(code) ?? null;
  }

  /** Returns all access codes belonging to a specific user. */
  async getCodesByUser(userId: string): Promise<AccessCode[]> {
    return [...this.codes.values()].filter((c) => c.userId === userId);
  }

  /** Creates a new access code record. */
  async createCode(code: AccessCode): Promise<AccessCode> {
    this.codes.set(code.code, code);
    return code;
  }

  /** Partially updates an access code. Returns the updated code, or `null` if not found. */
  async updateCode(
    code: string,
    data: Omit<Partial<AccessCode>, 'code'>,
  ): Promise<AccessCode | null> {
    const existing = this.codes.get(code);
    if (!existing) return null;
    const updated = { ...existing, ...data, code };
    this.codes.set(code, updated);
    return updated;
  }

  /** Deletes an access code. Returns `true` if the code existed. */
  async deleteCode(code: string): Promise<boolean> {
    return this.codes.delete(code);
  }

  /** Returns all sessions. */
  async getSessions(): Promise<Session[]> {
    return [...this.sessions.values()];
  }

  /** Returns a single session by token, or `null` if not found. */
  async getSession(token: string): Promise<Session | null> {
    return this.sessions.get(token) ?? null;
  }

  /** Returns all sessions created from a specific access code. */
  async getSessionsByCode(codeId: string): Promise<Session[]> {
    return [...this.sessions.values()].filter((s) => s.codeId === codeId);
  }

  /** Returns all sessions belonging to a specific user. */
  async getSessionsByUser(userId: string): Promise<Session[]> {
    return [...this.sessions.values()].filter((s) => s.userId === userId);
  }

  /** Creates a new session record. */
  async createSession(session: Session): Promise<Session> {
    this.sessions.set(session.token, session);
    return session;
  }

  /** Partially updates a session by token. Returns the updated session, or `null` if not found. */
  async updateSession(
    token: string,
    data: Omit<Partial<Session>, 'token'>,
  ): Promise<Session | null> {
    const session = this.sessions.get(token);
    if (!session) return null;
    const updated = { ...session, ...data, token };
    this.sessions.set(token, updated);
    return updated;
  }

  /** Deletes a session by token. Returns `true` if the session existed. */
  async deleteSession(token: string): Promise<boolean> {
    return this.sessions.delete(token);
  }

  /** Appends an access log entry. */
  async logAccess(log: AccessLog): Promise<void> {
    this.accessLogs.push(log);
  }

  /** Returns access log entries matching the given filters. An empty filter object returns all entries. */
  async getAccessLogs(filters: {
    codeId?: string;
    sessionToken?: string;
    appId?: string;
  }): Promise<AccessLog[]> {
    return this.accessLogs.filter((log) => {
      if (filters.codeId && log.codeId !== filters.codeId) return false;
      if (filters.sessionToken && log.sessionToken !== filters.sessionToken) return false;
      if (filters.appId && log.appId !== filters.appId) return false;
      return true;
    });
  }
}

