CREATE TABLE `live_recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`state` text DEFAULT 'receiving' NOT NULL,
	`next_sequence` integer DEFAULT 0 NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`playlist` text,
	`post_id` text,
	`error` text
);
