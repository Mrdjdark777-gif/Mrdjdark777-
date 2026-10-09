#!/usr/bin/env node
// Старый адрес. Настоящий файл — server/prune-live-posts.mjs (раскладка папок 9 октября 2026).
// Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
// на компьютере владельца продолжали работать. Править — только server/prune-live-posts.mjs.
await import(new URL('../server/prune-live-posts.mjs', import.meta.url));
