CREATE TABLE `git_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`repo_url` text NOT NULL,
	`file_path` text NOT NULL,
	`branch` text DEFAULT 'main' NOT NULL,
	`token_id` text,
	`cached_spec_id` text NOT NULL,
	`last_fetched_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`token_id`) REFERENCES `git_tokens`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `git_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`encrypted_token` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
