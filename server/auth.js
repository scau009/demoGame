import { createHmac, timingSafeEqual } from 'node:crypto';
import { ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET, TOKEN_TTL_HOURS } from './config.js';

function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

function sign(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const sig = createHmac('sha256', SESSION_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verify(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac('sha256', SESSION_SECRET).update(`${header}.${body}`).digest('base64url');
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function login(username, password) {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return null;
  const userOk = safeEqual(username, ADMIN_USERNAME);
  const passOk = safeEqual(password, ADMIN_PASSWORD);
  if (!userOk || !passOk) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: 'admin', iat: now, exp: now + TOKEN_TTL_HOURS * 3600 };
  return { token: sign(payload), expiresAt: payload.exp };
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: '需要登录' });
  }
  const payload = verify(header.slice(7));
  if (!payload) {
    return res.status(401).json({ error: 'unauthorized', message: 'Token 无效或已过期' });
  }
  next();
}

export { login, verify, authMiddleware };
