/** A record of a session accessing a specific app, used for analytics. */
export interface AccessLog {
  id: string;
  sessionToken: string;
  codeId: string | null;
  appId: string;
  accessedAt: Date;
  userAgent: string;
}
