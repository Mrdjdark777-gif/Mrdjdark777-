# Blender Assistant Bot

Telegram-бот-помощник по Blender: отвечает на вопросы, показывает горячие клавиши,
дает подборку ресурсов с 3D-моделями/текстурами и приносит свежие CG-новости.

## Возможности

- Свободные вопросы про Blender — бот ищет ответ в собственной базе знаний
  (`data/knowledge_base.json`); при неуверенном совпадении переспрашивает
  «Возможно, ты имел в виду?» с кнопками, а не отвечает наугад
- Опционально — указатель по официальному руководству Blender
  (`data/manual_index.json`, собирается скриптом `scripts/build_manual_index.py`)
  как запасной источник ссылок для тем вне базы знаний
- `/hotkeys` — горячие клавиши по категориям (навигация, моделирование, скульптинг,
  анимация и т.д.)
- `/resources` — подборка сайтов с 3D-моделями, текстурами, HDRI, аддонами и обучением
- `/news` — последние новости из RSS-лент BlenderNation, 80 Level, CG Channel
- `/help` — список команд
- `/broadcast <текст>` — рассылка всем, кто запускал `/start` (только для владельца бота)
- Inline-режим — вызов бота из любого чата командой `@ИмяБота вопрос`
- Автоматический лог вопросов без ответа (`data/unanswered_log.jsonl`) — для
  дальнейшего пополнения базы знаний

## Установка

1. Получи токен бота у [@BotFather](https://t.me/BotFather) в Telegram:
   - напиши `/newbot`, следуй инструкциям, скопируй выданный токен
2. Клонируй репозиторий и перейди в папку `blender_bot`
3. Создай виртуальное окружение и установи зависимости:

   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

4. Скопируй `.env.example` в `.env` и вставь свой токен:

   ```bash
   cp .env.example .env
   # затем отредактируй .env: BOT_TOKEN=твой_токен
   ```

   Чтобы пользоваться `/broadcast`, узнай свой Telegram ID у
   [@userinfobot](https://t.me/userinfobot) и впиши его в `.env` как `OWNER_ID`.
   Без этого рассылка отключена.

5. Запусти бота:

   ```bash
   python bot.py
   ```

Бот запустится в режиме polling — просто напиши ему в Telegram.

## Структура проекта

Начиная с Phase 2 рефакторинга (см. `PROJECT_PLAN.md`, `CLAUDE.md`) проект
переходит на модульную архитектуру по ТЗ (`docs/Blender_Expert_System_v2_TZ.pdf`,
раздел 39):

```
blender_bot/
├── bot.py                  # совместимый entry point (systemd всё ещё зовёт его)
├── app/
│   └── main.py              # настоящая точка входа: сборка Application, регистрация хендлеров
├── bot/
│   ├── handlers/             # обработчики команд/сообщений Telegram (тонкий слой)
│   └── news_fetcher.py        # RSS + перевод для /news
├── search/                     # KnowledgeBase, HotkeyLookup, ManualIndex, QAService
├── profile/                     # subscribers.py (заготовка user profile, Phase 12)
├── knowledge/                    # база знаний (пока пусто, Phase 3-4)
├── intents/ diagnostics/ education/  # будущие движки (пока пусто)
├── config/                        # загрузка токена и путей к данным
├── data/
│   ├── knowledge_base.json # вопросы/ответы по Blender
│   ├── hotkeys.json        # горячие клавиши по категориям
│   ├── resources.json      # ссылки на модели/текстуры/обучение
│   ├── news_feeds.json     # список RSS-лент CG-новостей
│   └── manual_index.json   # (генерируется) указатель по докам Blender
├── scripts/
│   └── build_manual_index.py  # сборка указателя по официальному руководству
└── tests/                    # автотесты
```

## Расширение базы знаний

Чтобы добавить новый вопрос-ответ, добавь объект в `data/knowledge_base.json`:

```json
{
  "question": "Текст вопроса",
  "keywords": ["ключевые", "слова"],
  "answer": "Текст ответа"
}
```

Поиск работает по совпадению ключевых слов и нечеткому сравнению текста — чем точнее
ключевые слова, тем лучше бот найдет нужный ответ.
