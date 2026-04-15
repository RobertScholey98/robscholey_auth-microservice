import { db } from '@/lib';
import { hashPassword, createSessionToken } from '@/lib';

/**
 * Seeds the in-memory database with test data for local development.
 * Creates an owner account, sample apps, named users, and access codes.
 * Only runs when the DB is empty (no existing owner).
 */
export async function seed(): Promise<void> {
  const existingUsers = await db.getUsers();
  if (existingUsers.length > 0) {
    console.log('  Database already seeded, skipping');
    return;
  }

  console.log('  Seeding dev database...');

  // Owner account
  const owner = await db.createUser({
    id: crypto.randomUUID(),
    name: 'rob',
    type: 'owner',
    username: 'rob',
    passwordHash: await hashPassword('test123'),
    createdAt: new Date(),
  });
  console.log('  ✓ Owner: rob / test123');

  // Sample apps
  const apps = [
    {
      id: 'portfolio',
      name: 'Portfolio',
      url: 'http://localhost:3002',
      iconUrl: '',
      description: 'Personal portfolio and projects',
      active: true,
    },
    {
      id: 'admin',
      name: 'Admin Panel',
      url: 'http://localhost:3005',
      iconUrl: '',
      description: 'Platform administration',
      active: true,
    },
    {
      id: 'demo',
      name: 'Demo App',
      url: 'http://localhost:3003',
      iconUrl: '',
      description: 'A demo sub-application',
      active: true,
    },
  ];

  for (const app of apps) {
    await db.createApp(app);
  }
  console.log(`  ✓ ${apps.length} apps registered (portfolio, admin, demo)`);

  // Named user
  const sarah = await db.createUser({
    id: crypto.randomUUID(),
    name: 'Sarah',
    type: 'named',
    createdAt: new Date(),
  });
  console.log('  ✓ Named user: Sarah');

  // Public access code — all apps, no password
  await db.createCode({
    code: 'TEST',
    userId: null,
    appIds: ['portfolio', 'demo'],
    passwordHash: null,
    expiresAt: null,
    createdAt: new Date(),
    label: 'Dev test code (public)',
  });
  console.log('  ✓ Public code: TEST → portfolio, demo');

  // Private access code — with password
  await db.createCode({
    code: 'SARAH',
    userId: sarah.id,
    appIds: ['portfolio', 'demo'],
    passwordHash: await hashPassword('pass123'),
    expiresAt: null,
    createdAt: new Date(),
    label: "Sarah's access (private)",
  });
  console.log('  ✓ Private code: SARAH / pass123 → portfolio, demo');

  // Custom company code
  await db.createCode({
    code: 'XYZ',
    userId: null,
    appIds: ['portfolio'],
    passwordHash: null,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    label: 'XYZ Corp - test code',
  });
  console.log('  ✓ Public code: XYZ → portfolio (expires in 30 days)');

  console.log('  Seed complete!\n');
  console.log('  Dev credentials:');
  console.log('    Owner login: rob / test123');
  console.log('    Public code: TEST (portfolio + demo)');
  console.log('    Private code: SARAH / pass123 (portfolio + demo)');
  console.log('    Company code: XYZ (portfolio only)');
  console.log('');
}
