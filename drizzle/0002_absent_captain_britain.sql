CREATE TABLE `shared_links` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`spec_id` text NOT NULL,
	`spec_title` text NOT NULL,
	`created_by_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`last_accessed_at` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_links_token_unique` ON `shared_links` (`token`);