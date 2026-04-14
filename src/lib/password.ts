import { hash, compare } from 'bcryptjs';

const SALT_ROUNDS = 10;

/**
 * Hashes a plaintext password using bcryptjs with a random salt.
 * @param password - The plaintext password to hash.
 * @returns The bcrypt hash string.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, SALT_ROUNDS);
}

/**
 * Compares a plaintext password against a bcrypt hash using constant-time comparison.
 * @param password - The plaintext password to check.
 * @param passwordHash - The bcrypt hash to compare against.
 * @returns `true` if the password matches the hash.
 */
export async function comparePassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}
