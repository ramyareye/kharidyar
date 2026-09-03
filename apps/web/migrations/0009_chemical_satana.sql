CREATE TABLE `context_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`workspace_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`schema_version` integer NOT NULL,
	`content_json` text NOT NULL,
	`content_bytes` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`collection_id`,`workspace_id`) REFERENCES `collections`(`id`,`workspace_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "context_snapshots_schema_version_check" CHECK("context_snapshots"."schema_version" = 1),
	CONSTRAINT "context_snapshots_actor_name_check" CHECK(length(trim("context_snapshots"."actor_name")) between 1 and 200),
	CONSTRAINT "context_snapshots_content_check" CHECK(json_valid("context_snapshots"."content_json") and typeof("context_snapshots"."content_bytes") = 'integer' and "context_snapshots"."content_bytes" between 1 and 1500000 and length(cast("context_snapshots"."content_json" as blob)) = "context_snapshots"."content_bytes")
);
--> statement-breakpoint
CREATE INDEX `context_snapshots_actor_time_idx` ON `context_snapshots` (`actor_user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `context_snapshots_collection_time_idx` ON `context_snapshots` (`collection_id`,`created_at`,`id`);