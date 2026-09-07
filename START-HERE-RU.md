> Актуальная самостоятельная архитектура и приоритеты: `docs/PROJECT-CONTEXT.md`. Изменения, HTTPS и уведомления: `docs/RELEASE-0.5-RU.md`. Сборочные инструкции ниже относятся к существующим оболочкам; адрес нового домена ещё не задан.

# True Thrills — полный исходный код 0.4.1

Это полный снимок исходников работающего проекта, включая Windows-клиент,
Android-клиент, общий интерфейс и серверную часть. Точный коммит указан в `SOURCE-MANIFEST.json` внутри архива исходников.
Состав и SHA256 каждого исходного файла записаны в `SOURCE-MANIFEST.json`.

## Где что находится

| Часть | Папки и файлы |
| --- | --- |
| Windows x64: клиент, установщик, ресурсы, сборка | `desktop/` |
| Android 8+: Java-клиент, ресурсы, Manifest, Gradle и сборщик | `android/` |
| Общий интерфейс студии и слушателя | `app/`, `components/`, `hooks/`, `lib/` |
| Подкасты, истории, загрузка аудио, сигналинг эфира | `app/api/`, `lib/server.ts` |
| Сервер и база данных | `worker/`, `db/`, `drizzle/` |
| Исправление длительности записей и перемотки | `lib/audio-file.ts`, `lib/prepare-audio.ts`, `workers/`, `components/studio/podcast-player.tsx` |
| Логотип, иконки и другие статические файлы | `public/`, `desktop/app.ico`, `android/app/src/main/res/` |
| Зависимости и конфигурация сборки | `package.json`, `package-lock.json`, `next.config.ts`, `drizzle.config.ts`, `.env.example` |
| Проверки и история изменений | `tests/`, `README.md` |

## Как устроены два приложения

Windows — нативный клиент Win32/C++ с WebView2 и EXE-установщиком.
Android — нативный Java launcher, полноэкранный WebView (без панели браузера) с мостом для нативных push-уведомлений через Firebase Cloud Messaging.
Оба используют один сервер и один веб-интерфейс. Это онлайн-приложения:
сам сервер не устанавливается вместе с EXE/APK. Для изменения большинства
экранов и функций нужно обновить общий интерфейс, а не только клиент.
Для замены иконок установленных приложений нужно пересобрать EXE и APK.

## Сборка Windows

Проверенный путь — Linux/WSL с Python 3 и Zig строго 0.13.0.
Сборщик сам скачивает Microsoft WebView2 SDK 1.0.2903.40 и проверяет SHA256.
Из корня распакованного проекта:

```sh
python3 desktop/build.py --zig /path/to/zig --output /path/to/windows-output
python3 desktop/verify.py /path/to/windows-output
```

Результат: `TrueThrills-Setup-0.4.1.exe`, клиент и WebView2Loader.dll.
На целевом Windows нужен WebView2 Runtime. Установщик не подписан
сертификатом издателя. Подробности — в README.md.

## Сборка Android

С добавлением Firebase Cloud Messaging сборка требует полноценного Gradle
(тянет `com.google.gms:google-services` и Firebase Maven-зависимости), а не
прежнего сборщика без Maven — `android/build.py` удалён. Нужны JDK 17,
Android SDK Platform 35, Build Tools 35.0.0, сеть до `google()`/Maven и
`google-services.json` в `android/app/` (из консоли Firebase, для приложения
`com.truethrills.listener`). Собирается через GitHub Actions
(`.github/workflows/android-build.yml`) — сеть до `dl.google.com` нужна и
для Android SDK, и для Gradle-зависимостей.

```sh
RELEASE_KEYSTORE=/private/truethrills-release.jks \
RELEASE_KEYSTORE_PASSWORD=... \
gradle -p android assembleRelease
```

Результат: `android/app/build/outputs/apk/release/app-release.apk`; package
`com.truethrills.listener`, versionCode 7, versionName 0.5.0, minSdk 26,
targetSdk 35. Для следующих выпусков увеличивайте versionCode в
`android/app/build.gradle`.

Приватный ключ и пароль хранятся отдельно: ранее переданный владельцу архив
`TrueThrills-Android-Signing-Backup.zip`. Для обновления установленного APK
нужен тот же ключ. В этот архив исходников он намеренно не включён.

## Общий интерфейс и сервер

Начиная с этой версии проект — обычное Node.js/Next.js-приложение,
без Cloudflare Workers, D1/R2 и входа через ChatGPT. Нужны Node.js
>=22.13.0 и npm.

```sh
cp .env.example .env   # задать ADMIN_PASSWORD и SESSION_SECRET
npm ci
node_modules/.bin/tsc --noEmit
npm run db:migrate
npm run build
npm start
```

База — файл SQLite (`DATABASE_PATH`, по умолчанию `./data/truethrills.db`),
миграции — в `drizzle/`. Аудио хранится локально на диске (`STORAGE_DIR`).
Вход — пароль автора из `ADMIN_PASSWORD` на странице `/login`
(`lib/auth.ts`, `app/api/auth/route.ts`); слушателям аккаунт не нужен.
Снимки базы, сами записи подкастов и пароли не являются исходным кодом
и в ZIP не включены.

Текущий адрес сервиса прописан в `desktop/client.cpp` и
`android/app/src/main/java/com/truethrills/listener/MainActivity.java`.
При переносе на свой домен нужно заменить эти адреса и пересобрать
десктоп-клиент и APK — иначе они продолжат стучаться на старый адрес.
Приложение должно работать за HTTPS (реверс-прокси): сессионная cookie
помечена `Secure` в продакшене.

## Логотип и прозрачность

Использован точный PNG из переданного владельцем RAR: 1080×1080, RGBA,
424370 полностью прозрачных пикселей. Его байты без изменений сохранены
в `public/brand/true-thrills-original.png`. Рисунок не генерировался заново.

Все PNG и ICO получены изменением размера с сохранением альфа-канала.
В Android удалена adaptive-icon конфигурация с принудительно чёрным фоном;
используются прозрачные PNG во всех плотностях. Конкретный Android launcher
может сам оформлять иконки своей системной рамкой/маской — её приложение
не контролирует. В самих ресурсах чёрной подложки нет.

Для повторной конвертации установите Pillow в свою среду Python и выполните:

```sh
python3 scripts/build-icons.py public/brand/true-thrills-original.png
```

Сборщик проверяет настоящую прозрачность входного PNG и всех размеров
выходных PNG/ICO. Он не удаляет фон и не перерисовывает логотип.
Адреса изображений в интерфейсе обновлены для обхода кэша прежних иконок.
Чтобы заменить значки установленных приложений, установите выпуск 0.4.1.
Android APK подписан тем же ключом, что и предыдущий выпуск.

## Что проверено при передаче

- TypeScript: `node_modules/.bin/tsc --noEmit` — успешно.
- Аудио (проверено при передаче 0.4.0, аудиокод в 0.4.1 не менялся):
  `node tests/audio-file.mjs` — успешно; конечная длительность,
  индекс перемотки, декодирование после перемотки, неизменность аудиопакетов,
  корректные WebM/MP3 и отклонение повреждённых файлов. Нужны ffmpeg/ffprobe.
- Production-сборка общего интерфейса и сервера — успешно.
- Windows: проверка PE, ресурсов и вложений установщика.
- Android: проверка подписи, package/versionCode и прозрачности иконок в APK.
- Каждый исходный файл ZIP сверяется с указанным коммитом.

Это не повторная проверка приложения на физических Windows и Android.
Текущие ограничения: пилотный эфир до 8 слушателей, STUN без TURN,
без офлайн-загрузок. Нативные push-уведомления Android (Firebase) добавлены,
но не проверены на реальном телефоне — см. RELEASE-0.5-RU.md. Донаты —
внешняя платёжная ссылка. Подробности реализации и прежних проверок
приведены в README.md.
