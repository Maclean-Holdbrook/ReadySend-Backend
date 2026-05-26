import crypto from 'node:crypto';
import { config } from './config.js';

export function createConfirmationToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashConfirmationToken(token) {
  return crypto
    .createHmac('sha256', config.tokenSecret)
    .update(token)
    .digest('hex');
}

export function getConfirmationExpiry(deliveryDate) {
  const date = new Date(`${deliveryDate}T23:59:59.999Z`);
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 14);
    return fallback.toISOString();
  }

  date.setDate(date.getDate() + 7);
  return date.toISOString();
}
