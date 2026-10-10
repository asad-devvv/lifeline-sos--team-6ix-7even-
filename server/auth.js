import crypto from 'crypto';
import { getSecret } from './db.js';

const SECRET = getSecret();
const mac = (p) => crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
const WEEK = 7 * 24 * 3600 * 1000;

// passwords: scrypt with a random salt per user, stored as "salt:hash"
export const hash = (pw) => {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
};
export const check = (pw, stored) => {
  const [s, h] = stored.split(':');
  const a = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64), b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// signed login token that expires after 7 days
export const sign = (user) => {
  const p = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + WEEK })).toString('base64url');
  return `${p}.${mac(p)}`;
};
export const verify = (t = '') => {
  const [p, sig] = t.split('.');
  if (!p || !sig || sig.length !== mac(p).length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(mac(p)))) return null;
  try {
    const u = JSON.parse(Buffer.from(p, 'base64url').toString());
    return u.exp > Date.now() ? u : null;
  } catch { return null; }
};
