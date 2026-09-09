import {consumeLoginAttempt,resetLoginAttempts} from '@/lib/login-limit';
import { clearSessionCookie, createSessionCookie, verifyPassword } from '@/lib/auth';
import { failure, originCheck, result } from '@/lib/server';

export async function POST(req: Request) {
  try {
    originCheck(req);
    const d = (await req.json()) as Record<string, unknown>;
    if (d.action === 'logout') {
      return result({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
    }
    const retry=consumeLoginAttempt(req);if(retry)return result({error:'#err.loginLimited'},429,{'Retry-After':String(retry)});
    const password = String(d.password ?? '');
    if (!password || !verifyPassword(password)) throw new Error('#err.badPassword');
    resetLoginAttempts(req);
    return result({ ok: true }, 200, { 'Set-Cookie': createSessionCookie(req) });
  } catch (e) {
    return failure(e);
  }
}
