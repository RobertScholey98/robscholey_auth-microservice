/** A registered sub-application in the platform. The `id` doubles as the URL slug. */
export interface App {
  id: string;
  name: string;
  url: string;
  iconUrl: string;
  description: string;
  active: boolean;
}
