export interface App {
  id: string;
  name: string;
  url: string;
  iconUrl: string;
  description: string;
  active: boolean;
}

export interface User {
  id: string;
  name: string;
  type: 'owner' | 'named' | 'anonymous';
  username?: string;
  passwordHash?: string;
  createdAt: Date;
}

export interface AccessCode {
  code: string;
  userId: string | null;
  appIds: string[];
  passwordHash: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  label: string;
}

export interface Session {
  token: string;
  codeId: string | null;
  userId: string | null;
  appIds: string[];
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
}

export interface AccessLog {
  id: string;
  sessionToken: string;
  codeId: string | null;
  appId: string;
  accessedAt: Date;
  userAgent: string;
}
