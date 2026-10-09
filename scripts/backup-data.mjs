#!/usr/bin/env node
// Старый адрес. Настоящий файл — server/backup-data.mjs (раскладка папок 9 октября 2026).
// Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
// на компьютере владельца продолжали работать. Править — только server/backup-data.mjs.
await import(new URL('../server/backup-data.mjs', import.meta.url));
