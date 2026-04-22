/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * Adds per-app default theme + accent so a sub-app's layout can SSR-render
 * `<html data-theme>` / `<html data-accent>` correctly without a postMessage
 * round-trip. NOT NULL with safe defaults so existing rows are backfilled
 * implicitly and downstream readers never see null.
 *
 * The seeded UPDATEs at the bottom mirror the desired per-app defaults from
 * `appsConfig.json` at the moment this migration was authored — every app
 * that was already in the DB before this column existed gets its true
 * intended accent, not the column-level fallback. Admin edits and future
 * config-side declarations both flow through `apps.service.syncFromConfig`'s
 * insert-only treatment for these columns (see service docstring).
 */
exports.up = (pgm) => {
  pgm.addColumns('apps', {
    default_theme: { type: 'text', notNull: true, default: 'dark' },
    default_accent: { type: 'text', notNull: true, default: 'teal' },
  });

  pgm.sql(`
    UPDATE apps SET default_accent = 'warm' WHERE id = 'portfolio';
    UPDATE apps SET default_accent = 'fsgb' WHERE id = 'admin';
    UPDATE apps SET default_accent = 'mono' WHERE id = 'template-child-nextjs';
  `);
};

exports.down = (pgm) => {
  pgm.dropColumns('apps', ['default_theme', 'default_accent']);
};
