import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

let instance: ReturnType<typeof drizzle> | undefined;

export function getDb() {
  if (instance) return instance;
  const path = process.env.DATABASE_PATH ?? './data/truethrills.db';
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  instance = drizzle(sqlite, { schema });
  return instance;
}
