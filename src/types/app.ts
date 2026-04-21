/** A registered sub-application in the platform. The `id` doubles as the URL slug. */
export interface App {
  id: string;
  name: string;
  url: string;
  iconUrl: string;
  description: string;
  active: boolean;
  /** Display-only version string surfaced by the shell selector (e.g. `0.3.0`). */
  version?: string;
  /** Last meaningful update to the app, surfaced on the selector card. */
  lastUpdatedAt?: Date;
  /** Lifecycle hint consumed by the shell selector to colour the card and gate interaction. */
  statusVariant?: 'live' | 'dev' | 'soon' | 'paused';
  /** Opaque key the shell maps to a local visual component (identity artwork). */
  visualKey?: string;
}
