import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";

/**
 * Какой код собран. Пишется в сборку один раз и потом виден и в /api/health, и
 * подписью в подвале приложения.
 *
 * Это не украшение. Трижды подряд владелец обновлял сервер и говорил «ничего
 * не изменилось», а выяснять, доехал ли код до телефона, приходилось кругом
 * переписки. Теперь это видно на экране.
 *
 * Сборка от этого упасть не должна: нет git, нет истории — остаётся «dev».
 */
function buildStamp(): string {
  if (process.env.TT_BUILD) return process.env.TT_BUILD;
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || "dev";
  } catch {
    return "dev";
  }
}

/**
 * Заголовки безопасности на всех ответах (15 октября, «хорошая защита»):
 * - nosniff — браузер не угадывает тип файла (загруженный «звук» не станет
 *   страницей со скриптом);
 * - frame-ancestors 'self' и X-Frame-Options — сайт нельзя встроить в чужую
 *   страницу и обманом заставить нажать кнопку студии (clickjacking);
 * - object-src 'none', base-uri 'self' — закрыты старые плагины и подмена
 *   базового адреса. Полный CSP со списком скриптов не ставится: Next
 *   вставляет свои встроенные скрипты, и строгий список сломал бы сайт;
 * - Referrer-Policy — чужим сайтам уходит только домен, без адреса страницы;
 * - Permissions-Policy — камера, геолокация, платежи, USB выключены; микрофон
 *   только у самого сайта (эфир из студии);
 * - HSTS — браузер ходит только по HTTPS год вперёд. По HTTP браузеры этот
 *   заголовок игнорируют, так что первичной настройке по IP он не мешает.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD: buildStamp() },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // data/ (uploaded audio/covers, live-stream recordings) is read via fully
  // dynamic runtime paths and was never meant to be walked by the build's
  // static file tracer -- excluded regardless of whether it's the cause of
  // the ARM64 build crash below.
  outputFileTracingExcludes: {
    '/**': ['./data/**'],
  },
  // sharp уменьшает обложки для плиток и приезжает необязательной зависимостью
  // next. Собирать его в пакет нельзя: это нативный модуль, и внутри сборки он
  // не заводится. Здесь сказано брать его на сервере как обычный пакет.
  serverExternalPackages: ['sharp'],
};

export default nextConfig;
