import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Single-owner session auth for the self-hosted deployment. Replaces the
 * ChatGPT Sites gateway, which used to set a trusted
 * `oai-authenticated-user-id` header. There is exactly one admin account
 * (the channel owner); listeners never sign in.
 */

const COOKIE_NAME = 'tt_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OWNER_ID = 'owner';

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error('Задайте SESSION_SECRET (случайная строка не короче 16 символов) в переменных окружения');
  }
  return value;
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionCookie(): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${OWNER_ID}.${expires}`;
  const token = `${payload}.${sign(payload)}`;
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readCookie(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === COOKIE_NAME) return rest.join('=');
  }
  return null;
}

function verifyToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [id, expires, signature] = parts;
  if (id !== OWNER_ID) return false;
  if (!Number.isFinite(Number(expires)) || Date.now() > Number(expires)) return false;
  const expected = sign(`${id}.${expires}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Returns the session owner id, or null when not signed in. Mirrors the old `userId(req)`. */
export function sessionUserId(req: Request): string | null {
  const token = readCookie(req);
  if (!token || !verifyToken(token)) return null;
  return OWNER_ID;
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw new Error('Задайте ADMIN_PASSWORD в переменных окружения');
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
