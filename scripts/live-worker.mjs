#!/usr/bin/env node
// Старый адрес. Настоящий файл — server/live-worker.mjs (раскладка папок 9 октября 2026).
// Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
// на компьютере владельца продолжали работать. Править — только server/live-worker.mjs.
await import(new URL('../server/live-worker.mjs', import.meta.url));
