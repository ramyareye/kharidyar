CREATE TABLE `visual_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`concept_id` text,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text NOT NULL,
	`access_token_id` text NOT NULL,
	`selection_json` text NOT NULL,
	`sources_json` text NOT NULL,
	`products_json` text NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer NOT NULL,
	`import_operation_id` text,
	`import_hash` text,
	`reported_model` text,
	`object_key` text,
	`reserved_bytes` integer DEFAULT 0 NOT NULL,
	`object_deleted_at` integer,
	`output_image_id` text,
	`error_code` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`output_image_id`) REFERENCES `concept_images`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "visual_runs_status_check" CHECK("visual_runs"."status" in ('ready','importing','completed','failed','cancelled')),
	CONSTRAINT "visual_runs_reservation_check" CHECK("visual_runs"."reserved_bytes" between 0 and 10485760),
	CONSTRAINT "visual_runs_json_check" CHECK(json_valid("visual_runs"."selection_json") and json_valid("visual_runs"."sources_json") and json_valid("visual_runs"."products_json")),
	CONSTRAINT "visual_runs_output_check" CHECK("visual_runs"."status" <> 'completed' or "visual_runs"."output_image_id" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visual_runs_import_operation_uidx` ON `visual_runs` (`user_id`,`client_id`,`import_operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `visual_runs_output_uidx` ON `visual_runs` (`output_image_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `visual_runs_object_uidx` ON `visual_runs` (`object_key`);--> statement-breakpoint
CREATE INDEX `visual_runs_collection_status_idx` ON `visual_runs` (`collection_id`,`status`);