#!/usr/bin/env node
// Старый адрес. Настоящий файл — server/prune-backups.mjs (раскладка папок 9 октября 2026).
// Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
// на компьютере владельца продолжали работать. Править — только server/prune-backups.mjs.
await import(new URL('../server/prune-backups.mjs', import.meta.url));
