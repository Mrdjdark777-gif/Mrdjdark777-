#!/usr/bin/env node
// Старый адрес. Настоящий файл — server/backfill-covers.mjs (раскладка папок 9 октября 2026).
// Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
// на компьютере владельца продолжали работать. Править — только server/backfill-covers.mjs.
await import(new URL('../server/backfill-covers.mjs', import.meta.url));
