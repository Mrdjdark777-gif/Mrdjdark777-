import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const settings = sqliteTable('settings', { key: text('key').primaryKey(), value: text('value').notNull() });
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(), kind: text('kind').notNull(), title: text('title').notNull(),
  description: text('description').notNull().default(''), body: text('body').notNull().default(''),
  audioKey: text('audio_key'), duration: integer('duration').notNull().default(0),
  published: integer('published').notNull().default(0), createdAt: integer('created_at').notNull(),
});
export const broadcasts = sqliteTable('broadcasts', {
  id: text('id').primaryKey(), title: text('title').notNull(), ownerId: text('owner_id').notNull(),
  heartbeat: integer('heartbeat').notNull(), active: integer('active').notNull().default(1),
});
export const peers = sqliteTable('peers', {
  id: text('id').primaryKey(), broadcastId: text('broadcast_id').notNull(), tokenHash: text('token_hash').notNull(),
  offer: text('offer').notNull(), answer: text('answer'), heartbeat: integer('heartbeat').notNull(),
});
