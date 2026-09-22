import {consumeLoginAttempt,resetLoginAttempts} from '@/lib/rate-limit';
import { clearSessionCookie, createSessionCookie, revokeAllSessions, verifyPassword } from '@/lib/auth';
import { failure, originCheck, requireOwner, result } from '@/lib/server';

export async function POST(req: Request) {
  try {
    originCheck(req);
    const d = (await req.json()) as Record<string, unknown>;
    if (d.action === 'logout') {
      return result({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
    }
    // «Выйти на всех устройствах». Обычный выход стирает cookie только в этом
    // браузере; её копия, снятая с чужого компьютера, оставалась годной до
    // своего срока, и смена пароля на это не влияла никак.
    if (d.action === 'revokeAll') {
      await requireOwner(req);
      revokeAllSessions();
      return result({ ok: true }, 200, { 'Set-Cookie': createSessionCookie(req) });
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
