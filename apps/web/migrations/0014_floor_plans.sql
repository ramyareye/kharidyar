CREATE TABLE `floor_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`uploaded_by_user_id` text NOT NULL,
	`status` text NOT NULL,
	`object_deleted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "floor_plans_title_check" CHECK(length(trim("floor_plans"."title")) between 1 and 200),
	CONSTRAINT "floor_plans_notes_check" CHECK("floor_plans"."notes" is null or length("floor_plans"."notes") <= 4000),
	CONSTRAINT "floor_plans_type_check" CHECK("floor_plans"."content_type" in ('image/webp', 'application/pdf')),
	CONSTRAINT "floor_plans_status_check" CHECK("floor_plans"."status" in ('pending', 'ready', 'deleted')),
	CONSTRAINT "floor_plans_bytes_check" CHECK(typeof("floor_plans"."byte_size") = 'integer' and "floor_plans"."byte_size" between 1 and 10485760),
	CONSTRAINT "floor_plans_dimensions_check" CHECK(("floor_plans"."content_type" = 'application/pdf' and "floor_plans"."width" is null and "floor_plans"."height" is null) or ("floor_plans"."content_type" = 'image/webp' and "floor_plans"."width" is not null and "floor_plans"."height" is not null and "floor_plans"."width" between 1 and 10000 and "floor_plans"."height" between 1 and 10000 and "floor_plans"."width" * "floor_plans"."height" <= 40000000))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `floor_plans_object_key_unique` ON `floor_plans` (`object_key`);--> statement-breakpoint
CREATE INDEX `floor_plans_collection_status_idx` ON `floor_plans` (`collection_id`,`status`);