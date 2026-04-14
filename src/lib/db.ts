import type { App, User, AccessCode, Session, AccessLog } from '../types';

export interface DB {
  // Apps
  getApps(): Promise<App[]>;
  getApp(id: string): Promise<App | null>;
  getAppMeta(id: string): Promise<{ name: string; iconUrl: string } | null>;
  createApp(app: App): Promise<App>;
  updateApp(id: string, data: Omit<Partial<App>, 'id'>): Promise<App | null>;
  deleteApp(id: string): Promise<boolean>;

  // Users
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  createUser(user: User): Promise<User>;
  updateUser(id: string, data: Omit<Partial<User>, 'id'>): Promise<User | null>;
  deleteUser(id: string): Promise<boolean>;

  // Access Codes
  getCodes(): Promise<AccessCode[]>;
  getCode(code: string): Promise<AccessCode | null>;
  getCodesByUser(userId: string): Promise<AccessCode[]>;
  createCode(code: AccessCode): Promise<AccessCode>;
  updateCode(code: string, data: Omit<Partial<AccessCode>, 'code'>): Promise<AccessCode | null>;
  deleteCode(code: string): Promise<boolean>;

  // Sessions
  getSession(token: string): Promise<Session | null>;
  getSessionsByCode(codeId: string): Promise<Session[]>;
  createSession(session: Session): Promise<Session>;
  updateSession(token: string, data: Omit<Partial<Session>, 'token'>): Promise<Session | null>;
  deleteSession(token: string): Promise<boolean>;

  // Access Logs
  logAccess(log: AccessLog): Promise<void>;
  getAccessLogs(filters: {
    codeId?: string;
    sessionToken?: string;
    appId?: string;
  }): Promise<AccessLog[]>;
}

export class InMemoryDB implements DB {
  private apps = new Map<string, App>();
  private users = new Map<string, User>();
  private codes = new Map<string, AccessCode>();
  private sessions = new Map<string, Session>();
  private accessLogs: AccessLog[] = [];

  // Apps

  async getApps(): Promise<App[]> {
    return [...this.apps.values()];
  }

  async getApp(id: string): Promise<App | null> {
    return this.apps.get(id) ?? null;
  }

  async getAppMeta(id: string): Promise<{ name: string; iconUrl: string } | null> {
    const app = this.apps.get(id);
    if (!app || !app.active) return null;
    return { name: app.name, iconUrl: app.iconUrl };
  }

  async createApp(app: App): Promise<App> {
    this.apps.set(app.id, app);
    return app;
  }

  async updateApp(id: string, data: Omit<Partial<App>, 'id'>): Promise<App | null> {
    const app = this.apps.get(id);
    if (!app) return null;
    const updated = { ...app, ...data, id };
    this.apps.set(id, updated);
    return updated;
  }

  async deleteApp(id: string): Promise<boolean> {
    return this.apps.delete(id);
  }

  // Users

  async getUsers(): Promise<User[]> {
    return [...this.users.values()];
  }

  async getUser(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.username === username) return user;
    }
    return null;
  }

  async createUser(user: User): Promise<User> {
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(id: string, data: Omit<Partial<User>, 'id'>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;
    const updated = { ...user, ...data, id };
    this.users.set(id, updated);
    return updated;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  // Access Codes

  async getCodes(): Promise<AccessCode[]> {
    return [...this.codes.values()];
  }

  async getCode(code: string): Promise<AccessCode | null> {
    return this.codes.get(code) ?? null;
  }

  async getCodesByUser(userId: string): Promise<AccessCode[]> {
    return [...this.codes.values()].filter((c) => c.userId === userId);
  }

  async createCode(code: AccessCode): Promise<AccessCode> {
    this.codes.set(code.code, code);
    return code;
  }

  async updateCode(code: string, data: Omit<Partial<AccessCode>, 'code'>): Promise<AccessCode | null> {
    const existing = this.codes.get(code);
    if (!existing) return null;
    const updated = { ...existing, ...data, code };
    this.codes.set(code, updated);
    return updated;
  }

  async deleteCode(code: string): Promise<boolean> {
    return this.codes.delete(code);
  }

  // Sessions

  async getSession(token: string): Promise<Session | null> {
    return this.sessions.get(token) ?? null;
  }

  async getSessionsByCode(codeId: string): Promise<Session[]> {
    return [...this.sessions.values()].filter((s) => s.codeId === codeId);
  }

  async createSession(session: Session): Promise<Session> {
    this.sessions.set(session.token, session);
    return session;
  }

  async updateSession(token: string, data: Omit<Partial<Session>, 'token'>): Promise<Session | null> {
    const session = this.sessions.get(token);
    if (!session) return null;
    const updated = { ...session, ...data, token };
    this.sessions.set(token, updated);
    return updated;
  }

  async deleteSession(token: string): Promise<boolean> {
    return this.sessions.delete(token);
  }

  // Access Logs

  async logAccess(log: AccessLog): Promise<void> {
    this.accessLogs.push(log);
  }

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

export const db = new InMemoryDB();
