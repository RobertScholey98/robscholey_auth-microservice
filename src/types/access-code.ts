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
