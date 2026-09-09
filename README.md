# True Thrills

Самостоятельная студия подкастов и эфиров для Windows и приложение слушателя для Android. Домен: https://truethrills.com. Автор входит паролем; слушатели без аккаунтов. Приложение не зависит от входа ChatGPT.

Ветка разработки 0.8: `codex/stabilize-0.8`; основная — `claude/read-link-content-h18psv`. Это подготовка к тестовому выпуску. Проверки серверной установки и физического телефона ещё нужны.

## Начать здесь

- [Простая инструкция владельцу](START-HERE-RU.md).
- [Изменения 0.8 и проверка телефона](docs/RELEASE-0.8-RU.md).
- [Сервер, backup и восстановление](docs/OPERATIONS-0.8-RU.md).
- [TURN на существующем VPS](docs/TURN-SETUP-RU.md).
- [Точка продолжения для Codex и Claude Code](docs/PROJECT-CONTEXT.md).

## Возможности

Запись микрофона/стереомикса FL Studio, черновики, публикация подкастов и историй, встроенные видео по внешним ссылкам, WebRTC-эфиры, внешняя ссылка поддержки. Интерфейс RU/IT. Android получает нативные Firebase-push и использует Media3 service для фоновых подкастов. Подкасты сохраняют позицию, поддерживают скорость и таймер сна. Истории сохраняют место и размер текста.

Прямой эфир пока WebRTC внутри WebView: перенос подкаста в службу не доказывает фоновую работу эфира. Пилот ограничен 8 слушателями, 100 push-устройствами и 80 МБ на аудио. Без конфигурации TURN остаётся STUN. Встроенных платежей, закрытого доступа, аккаунтов слушателей и офлайн-загрузок пока нет.

## Стек

Next.js 16.2.6, React 19.2.6, TypeScript, Node.js 22, better-sqlite3 и Drizzle. SQLite и аудио на диске VPS, nginx + systemd. Windows: C++/WebView2. Android: Java, WebView, Firebase, Media3; minSdk 26, targetSdk 35, package `com.truethrills.listener`, версия 0.8.0, versionCode 10.

## Локальная разработка

Установить Node.js 22, создать `.env` по `.env.example`, задать собственные `ADMIN_PASSWORD` и `SESSION_SECRET`. Не добавлять реальные секреты в git. Для проверки микрофона вне localhost нужен HTTPS.

```bash
npm ci --include=dev
node --env-file=.env node_modules/drizzle-kit/bin.cjs migrate
npm run dev
```

Проверки:

```bash
npm run lint
npm run build
node tests/api-integration.mjs
node tests/backup-integration.mjs
```

Для серверного выпуска обязательны миграции и предварительная копия: см. OPERATIONS. Новая миграция 0005 добавляет обложки и таблицу ограничения входа. Не обновлять только Next-код без схемы базы.

## Структура

| Путь | Назначение |
|---|---|
| `app/studio.tsx` | Интерфейс автора и слушателя |
| `app/api` | Публикации, аудио, эфир, push, вход, health и TURN |
| `components/studio` | Плееры, настройки, чтение, карточки |
| `hooks` | Захват аудио, WebRTC и уведомления |
| `lib` | Авторизация, файлы, push, аудиоподготовка, RU/IT |
| `db`, `drizzle` | Схема и миграции SQLite |
| `android` | Android-приложение, защищённый мост, Media3 service |
| `desktop` | Windows-клиент и установщик |
| `scripts` | Установка, HTTPS, обновление, backup и монитор |
| `tests` | Регрессионные серверные проверки |

## Сборки

GitHub Actions собирает Android APK (с прежним ключом из Secrets), Windows EXE и проверяет веб-часть. Артефакты доступны в успешном запуске workflow и хранятся 30 дней. До реальной приёмки не заменять ими публичную рабочую загрузку.

Для Android Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `GOOGLE_SERVICES_JSON_BASE64`. На сервере отдельно настраивается `FIREBASE_SERVICE_ACCOUNT_FILE`. Секреты не входят в исходники.

Windows можно собрать `python desktop/build.py --zig /path/to/zig`, затем `python desktop/verify.py desktop/out`. Требуется Zig 0.13.0; WebView2 SDK закреплён и проверяется по SHA256. Тест запуска на настоящей Windows выполняется отдельно.

Предыдущие инструкции сохранены как история в `docs/HISTORY-THROUGH-0.7.md` и `docs/HISTORICAL-START-0.5.md`; для новых установок использовать документы 0.8.
