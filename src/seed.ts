import type { DB } from '@/lib';
import { hashPassword } from '@/lib';

/**
 * Seeds dev-only scaffolding (named test user + public/private access codes) so
 * local development has something to poke at. Gated behind `NODE_ENV !== 'production'`
 * so Docker prod images skip it entirely. Idempotent — skips if a non-owner user
 * already exists, which is the proxy for "has already been seeded".
 *
 * The owner user and the apps list are NOT seeded here — they're handled by
 * {@link syncOwner} and {@link syncApps} on every boot, including prod.
 */
export async function seed(db: DB): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  const users = await db.getUsers();
  const hasNonOwner = users.some((u) => u.type !== 'owner');
  if (hasNonOwner) return;

  console.log('  Seeding dev scaffolding...');

  const sarah = await db.createUser({
    id: crypto.randomUUID(),
    name: 'Sarah',
    type: 'named',
    createdAt: new Date(),
  });

  await db.createCode({
    code: 'TEST',
    userId: null,
    appIds: ['template-child-nextjs'],
    passwordHash: null,
    expiresAt: null,
    createdAt: new Date(),
    label: 'Dev test code (public)',
  });

  await db.createCode({
    code: 'SARAH',
    userId: sarah.id,
    appIds: ['template-child-nextjs'],
    passwordHash: await hashPassword('pass123'),
    expiresAt: null,
    createdAt: new Date(),
    label: "Sarah's access (private)",
  });

  await db.createCode({
    code: 'XYZ',
    userId: null,
    appIds: ['template-child-nextjs'],
    passwordHash: null,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    label: 'XYZ Corp - test code',
  });

  console.log('  ✓ Dev scaffolding seeded (Sarah + TEST/SARAH/XYZ codes)');
}
