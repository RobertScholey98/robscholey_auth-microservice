/** A user in the system. Owner users have credentials; named and anonymous users authenticate via access codes. */
export interface User {
  id: string;
  name: string;
  type: 'owner' | 'named' | 'anonymous';
  username?: string;
  passwordHash?: string;
  createdAt: Date;
}
