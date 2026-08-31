CREATE TABLE `concepts` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`title` text NOT NULL,
	`narrative` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "concepts_title_length_check" CHECK(length(trim("concepts"."title")) between 1 and 120),
	CONSTRAINT "concepts_narrative_length_check" CHECK(length(trim("concepts"."narrative")) between 1 and 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `concepts_active_collection_uidx` ON `concepts` (`collection_id`) WHERE "concepts"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `concepts_collection_history_idx` ON `concepts` (`collection_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `collection_briefs` ADD `keywords_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `collection_briefs` ADD `materials_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `collection_briefs` ADD `preferred_brands_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `collection_briefs` ADD `intended_use` text;--> statement-breakpoint
ALTER TABLE `collection_briefs` ADD `requirements` text;--> statement-breakpoint
ALTER TABLE `collection_briefs` ADD `things_to_avoid` text;--> statement-breakpoint
ALTER TABLE `collection_briefs` ADD `reference_urls_json` text DEFAULT '[]' NOT NULL;
