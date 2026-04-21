/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * Phase 2 messaging — persists inbound contact-drawer messages and the
 * owner's replies. Threads are keyed by contact email (normalised
 * lowercase) so repeat visitors land on the same conversation.
 */

exports.up = (pgm) => {
  pgm.createTable('threads', {
    id: { type: 'text', primaryKey: true },
    // Stored lower-cased + trimmed by the service layer so the unique
    // constraint matches the "same email, same thread" intent.
    contact_email: { type: 'text', notNull: true, unique: true },
    contact_name: { type: 'text', notNull: true, default: '' },
    unread_count: { type: 'integer', notNull: true, default: 0 },
    last_message_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_message_preview: { type: 'text', notNull: true, default: '' },
    last_message_direction: {
      type: 'text',
      notNull: true,
      default: 'in',
      check: "last_message_direction IN ('in', 'out')",
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // Covers the thread-list query, which orders by most recent activity.
  pgm.createIndex('threads', 'last_message_at', { method: 'btree' });

  pgm.createTable('messages', {
    id: { type: 'text', primaryKey: true },
    thread_id: {
      type: 'text',
      notNull: true,
      references: 'threads(id)',
      onDelete: 'CASCADE',
    },
    direction: {
      type: 'text',
      notNull: true,
      check: "direction IN ('in', 'out')",
    },
    body: { type: 'text', notNull: true },
    session_token: { type: 'text' },
    code_id: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // Covers per-thread chronological reads (the chat view's primary query).
  pgm.createIndex('messages', ['thread_id', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('messages');
  pgm.dropTable('threads');
};
