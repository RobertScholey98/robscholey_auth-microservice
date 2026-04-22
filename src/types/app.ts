import type { Accent, AppTag, ShellTheme } from '@robscholey/contracts';

/** A registered sub-application in the platform. The `id` doubles as the URL slug. */
export interface App {
  id: string;
  name: string;
  url: string;
  iconUrl: string;
  description: string;
  active: boolean;
  /** Default theme the app's SSR layout renders into `<html data-theme>`. */
  defaultTheme: ShellTheme;
  /** Default accent the app's SSR layout renders into `<html data-accent>`. */
  defaultAccent: Accent;
  /** Display-only version string surfaced by the shell selector (e.g. `0.3.0`). */
  version?: string;
  /** Last meaningful update to the app, surfaced on the selector card. */
  lastUpdatedAt?: Date;
  /** Lifecycle hint consumed by the shell selector to colour the card and gate interaction. */
  statusVariant?: 'live' | 'dev' | 'soon' | 'paused';
  /** Opaque key the shell maps to a local visual component (identity artwork). */
  visualKey?: string;
  /**
   * Tags rendered on the shell selector card. Config-sourced — not persisted
   * on the DB row — populated by service-layer merges (e.g. `visibleAppsFor`)
   * before the record is handed to `appToWire`.
   */
  tags?: AppTag[];
  /**
   * Short mono-style marker rendered top-left on the selector card. Same
   * config-sourced provenance as {@link tags}.
   */
  visualMark?: string;
}
