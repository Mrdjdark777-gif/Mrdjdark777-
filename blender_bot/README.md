# Blender Helper

Бесплатная экспертная система по Blender в виде Telegram-бота
(`@Blenderhelpbot`) — работает **без платного AI API** (никакого
OpenAI/Anthropic/Gemini под капотом), ищет ответы в собственной базе
знаний (официальный Blender Manual + проверенные личные заметки),
понимает версии Blender, ведёт диагностику проблем и обучение. Собрана
по жёсткому техническому заданию (15 фаз), не пытается быть ChatGPT —
подробности см. `docs/Blender_Expert_System_v2_TZ.pdf`.

Полная документация, что бот умеет, и пошаговая инструкция по
разворачиванию/обновлению — **`DEPLOYMENT.md`** (или `DEPLOYMENT.pdf`).
Журнал фаз и честный список известных ограничений на каждом этапе —
`PROJECT_PLAN.md`. Архитектурные правила репозитория — `CLAUDE.md`.

## Коротко о возможностях

- Обычные вопросы про Blender текстом — поиск по базе знаний с учётом
  терминов, синонимов и словоформ; при неуверенности переспрашивает, а
  не отвечает наугад; по фразам вроде «подробнее»/«дай источники» даёт
  расширенный ответ с несколькими ссылками
- Диагностика типовых проблем (decision-tree диалог) — например,
  «после Subdivision модель ломается» или «рендер чёрный»
- Обучение: `/learn`, `/test`, `/exam`, `/next`, `/progress`, `/weaknesses`
- `/hotkeys`, `/resources`, `/news`, inline-режим (`@Blenderhelpbot вопрос`)
- Admin-инструменты для владельца: `/admin`, `/health`, `/stats`,
  `/sources`, `/version`, `/search`, `/debug`, `/reindex`, `/broadcast`

## Быстрый старт (локально, для разработки)

```bash
python -m venv venv
venv\Scripts\activate            # Windows; на Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env           # затем впиши BOT_TOKEN и OWNER_ID
python bot.py
```

Полная инструкция (включая разворачивание на бесплатном сервере Oracle
Cloud и обновление уже работающего бота) — **`DEPLOYMENT.md`**.

## Структура проекта

```
blender_bot/
├── bot.py                # совместимый entry point для systemd
├── app/main.py             # настоящая точка входа
├── bot/handlers/             # Telegram-слой (только формат сообщений/диалоги)
├── knowledge/                 # база знаний: official/, personal/, system/
├── search/                     # SearchEngine (TF-IDF + лемматизация + термины), QAService
├── intents/, diagnostics/, education/, profile/   # движки и хранилище
├── config/                     # .env, пути к данным
├── data/                        # hotkeys.json, resources.json, news_feeds.json
├── scripts/                      # обслуживающие скрипты (сборка/пересборка базы)
├── tests/                         # 236 юнит-тестов + tests/quality (Quality Score suite)
└── docs/Blender_Expert_System_v2_TZ.pdf
```

Подробная архитектура и правила работы над репозиторием — `CLAUDE.md`.
