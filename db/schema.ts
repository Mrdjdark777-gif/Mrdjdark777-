import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const settings = sqliteTable('settings', { key: text('key').primaryKey(), value: text('value').notNull() });
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(), kind: text('kind').notNull(), title: text('title').notNull(),
  description: text('description').notNull().default(''), body: text('body').notNull().default(''),
  audioKey: text('audio_key'), videoUrl: text('video_url'), duration: integer('duration').notNull().default(0),
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

export const pushSubscriptions=sqliteTable('push_subscriptions',{id:text('id').primaryKey(),manageHash:text('manage_hash').notNull(),subscription:text('subscription').notNull(),kind:text('kind').notNull().default('webpush'),preferences:integer('preferences').notNull().default(7),createdAt:integer('created_at').notNull(),testedAt:integer('tested_at').notNull().default(0)});
export const pushEvents=sqliteTable('push_events',{id:text('id').primaryKey(),createdAt:integer('created_at').notNull()});
export const pushOutbox=sqliteTable('push_outbox',{id:text('id').primaryKey(),subscriptionId:text('subscription_id').notNull(),payload:text('payload').notNull(),origin:text('origin').notNull(),category:integer('category').notNull(),expiresAt:integer('expires_at').notNull(),attempts:integer('attempts').notNull().default(0),availableAt:integer('available_at').notNull().default(0),state:text('state').notNull().default('pending')},t=>[index('push_pending_idx').on(t.state,t.availableAt)]);
