import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { db, id, nowIso } from './db.js';
import { env } from './env.js';

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 30;

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function sign(data: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(data).digest('base64url');
}

export function createAccessToken(userId: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS }));
  const body = `${header}.${payload}`;
  return `${body}.${sign(body)}`;
}

export function verifyAccessToken(token: string): string {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) throw new Error('Invalid token');
  const expected = sign(`${header}.${payload}`);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Invalid token');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string; exp?: number };
  if (!decoded.sub || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) throw new Error('Expired token');
  return decoded.sub;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, saltText, hashText] = encoded.split('$');
  if (algorithm !== 'scrypt' || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, 'base64url');
  const actual = scryptSync(password, Buffer.from(saltText, 'base64url'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(expected, actual);
}

function hashRefresh(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: string, userAgent?: string): { accessToken: string; refreshToken: string } {
  const refreshToken = randomBytes(48).toString('base64url');
  const now = nowIso();
  const expires = new Date(Date.now() + REFRESH_TTL_DAYS * 86400000).toISOString();
  db.prepare(
    `INSERT INTO sessions (id, user_id, refresh_hash, expires_at, created_at, last_used_at, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id('ses'), userId, hashRefresh(refreshToken), expires, now, now, userAgent ?? null);
  return { accessToken: createAccessToken(userId), refreshToken };
}

export function rotateSession(refreshToken: string): { accessToken: string; refreshToken: string } {
  const row = db.prepare('SELECT id, user_id, expires_at FROM sessions WHERE refresh_hash = ?').get(hashRefresh(refreshToken)) as any;
  if (!row || String(row.expires_at) < nowIso()) throw new Error('Invalid refresh token');
  db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
  return createSession(String(row.user_id));
}

export function requestUserId(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new Error('Authentication required');
  return verifyAccessToken(header.slice(7));
}
