import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const settings = sqliteTable('settings', { key: text('key').primaryKey(), value: text('value').notNull() });
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(), kind: text('kind').notNull(), title: text('title').notNull(),
  description: text('description').notNull().default(''), body: text('body').notNull().default(''),
  audioKey: text('audio_key'), videoUrl: text('video_url'), coverUrl:text('cover_url'), coverKey:text('cover_key'), duration: integer('duration').notNull().default(0),
  published: integer('published').notNull().default(0), createdAt: integer('created_at').notNull(),
});
export const broadcasts = sqliteTable('broadcasts', {
  id: text('id').primaryKey(), title: text('title').notNull(), ownerId: text('owner_id').notNull(),
  heartbeat: integer('heartbeat').notNull(), active: integer('active').notNull().default(1),
  coverKey: text('cover_key'),
  // Описание эфира: слушатель видит его на экране эфира, а после окончания оно
  // переходит в описание записи — рассказывать, о чём был эфир, нужно один раз.
  description: text('description').notNull().default(''),
});
export const peers = sqliteTable('peers', {
  id: text('id').primaryKey(), broadcastId: text('broadcast_id').notNull(), tokenHash: text('token_hash').notNull(),
  offer: text('offer').notNull(), answer: text('answer'), heartbeat: integer('heartbeat').notNull(),
});

export const pushSubscriptions=sqliteTable('push_subscriptions',{id:text('id').primaryKey(),manageHash:text('manage_hash').notNull(),subscription:text('subscription').notNull(),kind:text('kind').notNull().default('webpush'),locale:text('locale').notNull().default('ru'),preferences:integer('preferences').notNull().default(7),createdAt:integer('created_at').notNull(),testedAt:integer('tested_at').notNull().default(0)});
export const pushEvents=sqliteTable('push_events',{id:text('id').primaryKey(),createdAt:integer('created_at').notNull()});
export const pushOutbox=sqliteTable('push_outbox',{id:text('id').primaryKey(),subscriptionId:text('subscription_id').notNull(),payload:text('payload').notNull(),origin:text('origin').notNull(),category:integer('category').notNull(),expiresAt:integer('expires_at').notNull(),attempts:integer('attempts').notNull().default(0),availableAt:integer('available_at').notNull().default(0),state:text('state').notNull().default('pending')},t=>[index('push_pending_idx').on(t.state,t.availableAt)]);

/**
 * Форма звука считается воркером вне запроса и кэшируется по ключу файла и его
 * контрольной сумме: перезалитый выпуск получает новые пики, а не старую
 * картинку. Черновые пики защищены так же, как исходный звук, — строка живёт
 * ровно столько, сколько сам файл.
 */
export const audioPeaks=sqliteTable('audio_peaks',{
 audioKey:text('audio_key').primaryKey(),sha256:text('sha256').notNull().default(''),
 peaks:text('peaks').notNull().default(''),state:text('state').notNull().default('pending'),
 updatedAt:integer('updated_at').notNull(),error:text('error'),
});

export const rateLimits=sqliteTable('rate_limits',{id:text('id').primaryKey(),attempts:integer('attempts').notNull(),expiresAt:integer('expires_at').notNull()});

export const liveRecordings=sqliteTable('live_recordings',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),title:text('title').notNull(),
 state:text('state').notNull().default('receiving'),nextSequence:integer('next_sequence').notNull().default(0),
 bytes:integer('bytes').notNull().default(0),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
 playlist:text('playlist'),postId:text('post_id'),error:text('error'),
});
