/** Direction of a message relative to the owner — see the contract's {@link MessageDirection}. */
export type MessageDirection = 'in' | 'out';

/**
 * Domain-side thread record — the in-memory / DB-row shape. Dates are
 * {@link Date} objects; the HTTP boundary converts them to ISO strings on
 * the way out.
 */
export interface Thread {
  id: string;
  contactEmail: string;
  contactName: string;
  unreadCount: number;
  lastMessageAt: Date;
  lastMessagePreview: string;
  lastMessageDirection: MessageDirection;
  createdAt: Date;
}

/** Domain-side message record — DB rows and service values share this shape. */
export interface Message {
  id: string;
  threadId: string;
  direction: MessageDirection;
  body: string;
  sessionToken: string | null;
  codeId: string | null;
  createdAt: Date;
}
