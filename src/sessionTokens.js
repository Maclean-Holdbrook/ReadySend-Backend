import crypto from 'node:crypto';
import { config } from './config.js';

function encode(input) {
  return Buffer.from(JSON.stringify(input)).toString('base64url');
}

function sign(payload) {
  return crypto.createHmac('sha256', config.tokenSecret).update(payload).digest('base64url');
}

export function createSessionToken({ sellerId, accountId, email }) {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sellerId,
    accountId,
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
  });
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${sign(unsigned)}`;
}

export function verifySessionToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const unsigned = `${header}.${payload}`;
  if (sign(unsigned) !== signature) return null;

  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
  return data;
}
