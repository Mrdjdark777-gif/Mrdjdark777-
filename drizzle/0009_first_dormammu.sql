CREATE TABLE `audio_peaks` (
	`audio_key` text PRIMARY KEY NOT NULL,
	`sha256` text DEFAULT '' NOT NULL,
	`peaks` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`updated_at` integer NOT NULL,
	`error` text
);
