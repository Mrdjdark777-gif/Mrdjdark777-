#!/usr/bin/env node
// Старый адрес. Настоящий файл — server/community-db.mjs (раскладка папок 9 октября 2026).
// Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
// на компьютере владельца продолжали работать. Править — только server/community-db.mjs.
await import(new URL('../server/community-db.mjs', import.meta.url));
