import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const [salt, key] = String(storedHash || '').split(':');
  if (!salt || !key) return false;

  const derived = await scrypt(password, salt, 64);
  const stored = Buffer.from(key, 'hex');

  if (stored.length !== derived.length) return false;
  return crypto.timingSafeEqual(stored, derived);
}
