import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {getDb} from '@/db';

/**
 * Счётчики попыток в таблице rate_limits.
 *
 * Адрес берётся из X-Real-IP и только когда TRUST_PROXY=true: без прокси
 * заголовку верить нельзя. Когда адреса нет, все запросы попадали бы в одно
 * ведро — для входа владельца это допустимо (он один), а для подписки на
 * уведомления означало бы, что десятый слушатель закрывает регистрацию всем
 * остальным. Поэтому ведро без адреса возвращается отдельно, и вызывающий
 * решает, что с этим делать.
 */
function clientIp(req: Request) {
  if (process.env.TRUST_PROXY !== 'true') return null;
  const ip = req.headers.get('x-real-ip') ?? '';
  return isIP(ip) ? ip : null;
}
function key(bucket: string, who: string) {
  return createHmac('sha256', process.env.SESSION_SECRET ?? '').update(bucket + ':' + who).digest('hex');
}
/** Возвращает 0, если попытка разрешена, иначе секунды до снятия блокировки. */
function consume(id: string, max: number, windowMs: number) {
  const db = getDb().$client, now = Date.now();
  return db.transaction(() => {
    db.prepare('DELETE FROM rate_limits WHERE expires_at<=?').run(now);
    const row = db.prepare('SELECT attempts,expires_at FROM rate_limits WHERE id=?').get(id) as {attempts: number; expires_at: number} | undefined;
    if (row && row.attempts >= max) return Math.max(1, Math.ceil((row.expires_at - now) / 1000));
    db.prepare('INSERT INTO rate_limits(id,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1').run(id, now + windowMs);
    return 0;
  })();
}

export function consumeLoginAttempt(req: Request) {
  return consume(key('login', clientIp(req) ?? 'direct'), 10, 600000);
}
export function resetLoginAttempts(req: Request) {
  getDb().$client.prepare('DELETE FROM rate_limits WHERE id=?').run(key('login', clientIp(req) ?? 'direct'));
}
/**
 * Регистрация устройства для уведомлений. Своё устройство человек
 * перерегистрирует редко — при смене токена FCM и при смене языка, — так что
 * десяток попыток в час с одного адреса это с большим запасом. Общий предел
 * числа устройств остаётся последним рубежом.
 *
 * Без доверенного прокси адреса нет и ограничивать нечего: глобальное ведро
 * закрыло бы регистрацию всем сразу, а это хуже, чем её отсутствие.
 */
export function consumeSubscribeAttempt(req: Request) {
  const ip = clientIp(req);
  return ip === null ? 0 : consume(key('subscribe', ip), 10, 3600000);
}
