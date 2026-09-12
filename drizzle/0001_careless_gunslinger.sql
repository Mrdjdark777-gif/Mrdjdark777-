CREATE TABLE `push_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`payload` text NOT NULL,
	`origin` text NOT NULL,
	`category` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_pending_idx` ON `push_outbox` (`state`,`available_at`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`manage_hash` text NOT NULL,
	`subscription` text NOT NULL,
	`preferences` integer DEFAULT 7 NOT NULL,
	`created_at` integer NOT NULL,
	`tested_at` integer DEFAULT 0 NOT NULL
);
