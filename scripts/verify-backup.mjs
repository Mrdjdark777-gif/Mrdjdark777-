#!/usr/bin/env node
// Старый адрес. Настоящий файл — server/verify-backup.mjs (раскладка папок 9 октября 2026).
// Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
// на компьютере владельца продолжали работать. Править — только server/verify-backup.mjs.
await import(new URL('../server/verify-backup.mjs', import.meta.url));
