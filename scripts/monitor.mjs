#!/usr/bin/env node
// Старый адрес. Настоящий файл — server/monitor.mjs (раскладка папок 9 октября 2026).
// Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
// на компьютере владельца продолжали работать. Править — только server/monitor.mjs.
await import(new URL('../server/monitor.mjs', import.meta.url));
