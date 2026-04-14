/** A registered sub-application in the platform. The `id` doubles as the URL slug. */
export interface App {
  id: string;
  name: string;
  url: string;
  iconUrl: string;
  description: string;
  active: boolean;
}

/** A user in the system. Owner users have credentials; named and anonymous users authenticate via access codes. */
export interface User {
  id: string;
  name: string;
  type: 'owner' | 'named' | 'anonymous';
  username?: string;
  passwordHash?: string;
  createdAt: Date;
}

/** An access code that grants access to a set of apps. Can be public (no password) or private (password-protected). */
export interface AccessCode {
  code: string;
  userId: string | null;
  appIds: string[];
  passwordHash: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  label: string;
}

/** A server-side session created when a user authenticates via login or access code. */
export interface Session {
  token: string;
  codeId: string | null;
  userId: string | null;
  appIds: string[];
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
}

/** A record of a session accessing a specific app, used for analytics. */
export interface AccessLog {
  id: string;
  sessionToken: string;
  codeId: string | null;
  appId: string;
  accessedAt: Date;
  userAgent: string;
}
