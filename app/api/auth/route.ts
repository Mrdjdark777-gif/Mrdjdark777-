import { clearSessionCookie, createSessionCookie, verifyPassword } from '@/lib/auth';
import { failure, originCheck, result } from '@/lib/server';

export async function POST(req: Request) {
  try {
    originCheck(req);
    const d = (await req.json()) as Record<string, unknown>;
    if (d.action === 'logout') {
      return result({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
    }
    const password = String(d.password ?? '');
    if (!password || !verifyPassword(password)) throw new Error('Неверный пароль');
    return result({ ok: true }, 200, { 'Set-Cookie': createSessionCookie() });
  } catch (e) {
    return failure(e);
  }
}
