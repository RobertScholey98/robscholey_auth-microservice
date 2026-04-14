export function createSessionToken(): string {
  return `sess_${crypto.randomUUID()}`;
}
