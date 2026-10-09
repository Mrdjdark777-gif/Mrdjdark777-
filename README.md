# True Thrills

Свой канал историй, аудио, видео и прямых эфиров на собственном сервере.
Один код обслуживает:
- сайт;
- приложение слушателя для Android;
- студию автора для Windows.

Поддержка канала — только добровольная. Выпуски доступны с сервера,
даже когда компьютер автора выключен. Компьютер нужен только на время
записи и эфира.

Правообладатель и условия — в `LICENSE`.

## С чего начать

| Кто вы | Что читать |
|---|---|
| Принимаете проект на проверку | [docs/owner/ЧИТАТЬ-ПЕРВЫМ.md](docs/owner/ЧИТАТЬ-ПЕРВЫМ.md) — разделено для инженеров и юристов |
| Владелец, выкладка и обслуживание | [docs/owner/START-HERE-RU.md](docs/owner/START-HERE-RU.md) |
| Нужен весь проект одним документом | [docs/owner/PROJECT-BRIEF-RU.md](docs/owner/PROJECT-BRIEF-RU.md) |
| Продолжаете разработку | [docs/owner/PROJECT-CONTEXT.md](docs/owner/PROJECT-CONTEXT.md), правила — [CLAUDE.md](CLAUDE.md) |
| Что изменилось последним | [docs/owner/ИЗМЕНЕНО-СЕЙЧАС.md](docs/owner/ИЗМЕНЕНО-СЕЙЧАС.md) |

## Карта репозитория

```
app/            страницы и API (Next.js 16, React 19, TypeScript)
components/     интерфейс: studio/ — экраны, ui/ — общие элементы
hooks/          захват звука, эфир, ширина экрана, программа для ПК
lib/            общая логика: хранилище, проверки медиа, переводы (lib/i18n)
db/ drizzle/    схема SQLite и миграции
workers/        фоновый разбор аудио в браузере
public/         статика, APK для скачивания (public/app)
android/        приложение слушателя: Java, WebView, Media3, Firebase
desktop/        студия автора для Windows: C++ и WebView2
vendor/         сторонний CSS с лицензией рядом

server/         всё, что работает на сервере (VPS):
                update-safe.sh — обновление с копией и откатом;
                install-operations.sh — службы и таймеры systemd;
                live-worker.mjs — воркер эфира; monitor.mjs — мониторинг;
                backup-*, export-backup.sh, verify-backup.mjs — копии и их проверка;
                prune-*, server-cleanup.sh, data-status.mjs — уборка и отчёты;
                vps-setup.sh, enable-https.sh — первая установка сервера
tools/windows/  программы владельца для Windows: обновление сервера в один
                клик, копия вне сервера, открытие копии
tools/dev/      инструменты разработки: иконки, опись лицензий, выкладка APK
scripts/        ТОЛЬКО переходники со старых адресов — см. ниже
.claude/        роли и порядок работы для Claude Code (docs/owner/ECC-SETUP-RU.md)

tests/unit/         чистая логика, без процессов и сети
tests/integration/  временная база, сервер, ffmpeg, серверные скрипты
tests/browser/      настоящая сборка в Chromium
tests/sweeps/       большие обходы со снимками: дизайн, телефоны, читалка, плеер
tests/guards/       порядок в самом репозитории (см. «Контроль»)
tests/fixtures/     данные проверок: обложки, замок телефонной раскладки

docs/owner/       передача проекта, контекст, что изменилось
docs/releases/    описания выпусков
docs/operations/  выкладка, обслуживание, TURN, процесс обновления
docs/audits/      ревизии и разборы
docs/legal/       права, лицензии сторонних компонентов, персональные данные
docs/design/      обложки, договор поверхностей (SURFACES-RU.md)
```

### Почему есть `scripts/`

Серверные скрипты переехали в `server/`, программы для Windows — в
`tools/windows/` (9 октября 2026). Старые адреса продолжают работать, потому
что ими пользуются:
- программа обновления на компьютере владельца. Это старая копия из архива: она копирует с сервера `scripts/update-safe.sh`, `scripts/backup-data.mjs` и `scripts/verify-backup.mjs`;
- таймеры и службы, записанные прежней установкой;
- команды из старых инструкций.

В `scripts/` лежат только переходники в две-три строки. Править нужно
`server/` и `tools/`. За этим следит `tests/guards/compat-shims.mjs`:
- у каждого файла есть переходник;
- переходник ведёт куда нужно;
- обновление из старой программы доходит до `server/update-safe.sh`.

## Поверхности

Сайт сам определяет, кто его открыл, и даёт каждому свой каркас:
- **телефон и сенсорный планшет** — телефонный каркас;
- **слушатель на ПК** — сайт «Студия звука» с боковым меню;
- **программа для ПК** — то же, но без ссылки «Скачать приложение»;
- **автор** — студия;
- **Android** — родной плеер.

Договор описан в [docs/design/SURFACES-RU.md](docs/design/SURFACES-RU.md), его держит `tests/browser/surfaces.mjs`.

## Проверки

```bash
npm ci
npm run lint
npm test                # сборка + test:guards + test:unit + test:integration (браузер не нужен)
npm run test:live       # настоящий конвейер эфира: FFmpeg и HLS
npm run test:browser    # браузерные проверки; нужен Chrome: npx playwright install chrome chromium
npm run test:design     # снимки на production-сборке, замок телефонной раскладки
npm run test:reader && npm run test:player-enhancements && npm run test:home-depth && npm run test:phones
```

Браузерным проверкам можно указать браузер: `TT_BROWSER_EXECUTABLE=/путь/к/chrome`.

### Контроль

- `tests/guards/suite-complete.mjs` — каждая проверка лежит в своей папке и
  запускается сценарием этой папки; ни одна не осталась без запуска.
- `tests/guards/selectors-alive.mjs` — проверки не ищут на страницах того, чего
  в продукте больше нет.
- `tests/guards/doc-links.mjs` — ссылки и пути в документах ведут на то, что есть.
- `tests/guards/compat-shims.mjs` — старые адреса скриптов работают.
- `tests/guards/licenses.mjs`, `legal-docs.mjs`, `i18n-keys.mjs`,
  `windows-scripts.mjs`, `service-hardening.mjs` — лицензии, правовые
  документы, переводы, кодировки скриптов Windows, права служб на сервере.

Новые проверки прогоняются мутацией: код ломают нарочно и убеждаются, что
проверка называет поломку словами (см. `CLAUDE.md`).

CI — `.github/workflows/web-checks.yml`. Он запускает `npm test`, затем ставит браузер и прогоняет браузерные проверки и обходы. Сборка APK — `android-build.yml`, программы для Windows — `desktop-build.yml`.

## Ветки

| Ветка | Роль |
|---|---|
| `design/six-screens` | основная: с неё обновляется сервер (только перемотка вперёд, история не переписывается), на ней CI и сборки APK и EXE |
| `archive/cinema-home` | сохранённый вариант главной «Кино» (бывшая `design/cinema-home`), не обновляется |
| `feature/plugin-system-v1` | черновик владельца (PR №5), не трогается |
| `blender-helper-bot` | ветка владельца вне этого проекта; не трогается |
| `claude/…` | рабочие ветки сессий; после слияния удаляются |

`truethrills-app`, `codex/review-player-live-2026-09-15` и
`claude/read-link-content-h18psv` целиком влиты в `design/six-screens` и
подлежат удалению. Ветку по умолчанию, переименование и удаление веток владелец
делает в веб-интерфейсе GitHub: доступ, через который работает помощник, менять
ветки и настройки репозитория не может (ответ 403).

## Чего в репозитории нет и не должно быть

Ключ SSH, `.env` сервера, `firebase-service-account.json`, ключ подписи APK.
Всё это хранится только у владельца, не в архивах и не в переписке.
