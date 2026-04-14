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
