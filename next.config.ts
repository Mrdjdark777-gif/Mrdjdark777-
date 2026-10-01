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

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD: buildStamp() },
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
