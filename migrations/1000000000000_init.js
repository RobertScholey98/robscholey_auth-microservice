/* eslint-disable @typescript-eslint/no-var-requires */

exports.up = (pgm) => {
  pgm.createTable('apps', {
    id: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true },
    url: { type: 'text', notNull: true },
    icon_url: { type: 'text', notNull: true, default: '' },
    description: { type: 'text', notNull: true, default: '' },
    active: { type: 'boolean', notNull: true, default: true },
  });

  pgm.createTable('users', {
    id: { type: 'text', primaryKey: true },
    name: { type: 'text', notNull: true },
    type: {
      type: 'text',
      notNull: true,
      check: "type IN ('owner', 'named', 'anonymous')",
    },
    username: { type: 'text', unique: true },
    password_hash: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('access_codes', {
    code: { type: 'text', primaryKey: true },
    user_id: { type: 'text', references: 'users(id)', onDelete: 'CASCADE' },
    app_ids: { type: 'text[]', notNull: true },
    password_hash: { type: 'text' },
    expires_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    label: { type: 'text', notNull: true, default: '' },
  });
  pgm.createIndex('access_codes', 'user_id');

  pgm.createTable('sessions', {
    token: { type: 'text', primaryKey: true },
    code_id: { type: 'text', references: 'access_codes(code)', onDelete: 'SET NULL' },
    user_id: { type: 'text', references: 'users(id)', onDelete: 'CASCADE' },
    app_ids: { type: 'text[]', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_active_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
  });
  pgm.createIndex('sessions', 'user_id');
  pgm.createIndex('sessions', 'code_id');

  pgm.createTable('access_logs', {
    id: { type: 'text', primaryKey: true },
    session_token: { type: 'text', notNull: true },
    code_id: { type: 'text' },
    app_id: { type: 'text', notNull: true },
    accessed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    user_agent: { type: 'text', notNull: true, default: '' },
  });
  pgm.createIndex('access_logs', 'session_token');
};

exports.down = (pgm) => {
  pgm.dropTable('access_logs');
  pgm.dropTable('sessions');
  pgm.dropTable('access_codes');
  pgm.dropTable('users');
  pgm.dropTable('apps');
};
