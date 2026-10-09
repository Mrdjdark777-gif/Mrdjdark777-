#!/usr/bin/env node
// Старый адрес. Настоящий файл — server/checksum-storage.mjs (раскладка папок 9 октября 2026).
// Этот переходник оставлен, чтобы прежние команды, таймеры и копии программ
// на компьютере владельца продолжали работать. Править — только server/checksum-storage.mjs.
await import(new URL('../server/checksum-storage.mjs', import.meta.url));
