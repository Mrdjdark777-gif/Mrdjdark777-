#!/usr/bin/env node
// Старый адрес. Настоящий файл — server/data-status.mjs (раскладка папок 9 октября 2026).
// Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
// на компьютере владельца продолжали работать. Править — только server/data-status.mjs.
await import(new URL('../server/data-status.mjs', import.meta.url));
