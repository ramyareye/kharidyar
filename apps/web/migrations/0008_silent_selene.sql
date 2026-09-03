CREATE TABLE `research_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`item_id` text,
	`query` text NOT NULL,
	`constraints_json` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`collection_id`,`workspace_id`) REFERENCES `collections`(`id`,`workspace_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "research_requests_query_check" CHECK(length(trim("research_requests"."query")) between 1 and 1000),
	CONSTRAINT "research_requests_constraints_check" CHECK(json_valid("research_requests"."constraints_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_requests_id_collection_workspace_uidx` ON `research_requests` (`id`,`collection_id`,`workspace_id`);--> statement-breakpoint
CREATE INDEX `research_requests_collection_time_idx` ON `research_requests` (`collection_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `research_requests_item_idx` ON `research_requests` (`item_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `research_result_promotions` (
	`result_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`item_id` text NOT NULL,
	`product_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`merchant_id` text NOT NULL,
	`offer_id` text NOT NULL,
	`price_check_id` text NOT NULL,
	`promoted_by_user_id` text NOT NULL,
	`promoted_at` integer NOT NULL,
	FOREIGN KEY (`result_id`) REFERENCES `research_results`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`promoted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`collection_id`,`workspace_id`) REFERENCES `collections`(`id`,`workspace_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "research_result_promotions_identifier_check" CHECK(
				length(trim("research_result_promotions"."item_id")) between 1 and 200
				and length(trim("research_result_promotions"."product_id")) between 1 and 200
				and length(trim("research_result_promotions"."candidate_id")) between 1 and 200
				and length(trim("research_result_promotions"."merchant_id")) between 1 and 200
				and length(trim("research_result_promotions"."offer_id")) between 1 and 200
				and length(trim("research_result_promotions"."price_check_id")) between 1 and 200
			)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_result_promotions_candidate_uidx` ON `research_result_promotions` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `research_result_promotions_item_idx` ON `research_result_promotions` (`item_id`);--> statement-breakpoint
CREATE TABLE `research_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`score` real,
	`status` text DEFAULT 'active' NOT NULL,
	`suggestion_json` text,
	`snapshot_expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`source_id`,`run_id`) REFERENCES `research_sources`(`id`,`run_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "research_results_title_check" CHECK(length(trim("research_results"."title")) between 1 and 240),
	CONSTRAINT "research_results_summary_check" CHECK("research_results"."summary" is null or length(trim("research_results"."summary")) between 1 and 4000),
	CONSTRAINT "research_results_score_check" CHECK("research_results"."score" is null or ("research_results"."score" >= 0 and "research_results"."score" <= 1)),
	CONSTRAINT "research_results_status_check" CHECK("research_results"."status" in ('active', 'dismissed')),
	CONSTRAINT "research_results_suggestion_check" CHECK("research_results"."suggestion_json" is null or json_valid("research_results"."suggestion_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_results_source_uidx` ON `research_results` (`source_id`);--> statement-breakpoint
CREATE INDEX `research_results_run_status_idx` ON `research_results` (`run_id`,`status`);--> statement-breakpoint
CREATE INDEX `research_results_snapshot_expiry_idx` ON `research_results` (`snapshot_expires_at`);--> statement-breakpoint
CREATE TABLE `research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`provider` text NOT NULL,
	`provider_query` text NOT NULL,
	`workflow_instance_id` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`requested_by_user_id` text NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`request_id`,`collection_id`,`workspace_id`) REFERENCES `research_requests`(`id`,`collection_id`,`workspace_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "research_runs_status_check" CHECK("research_runs"."status" in ('queued', 'running', 'partial', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "research_runs_provider_check" CHECK("research_runs"."provider" = 'tavily-basic-v1'),
	CONSTRAINT "research_runs_query_check" CHECK(length(trim("research_runs"."provider_query")) between 1 and 2000),
	CONSTRAINT "research_runs_error_pair_check" CHECK((
				("research_runs"."error_code" is null and "research_runs"."error_message" is null)
				or
				("research_runs"."error_code" is not null and length(trim("research_runs"."error_code")) between 1 and 80 and "research_runs"."error_message" is not null and length(trim("research_runs"."error_message")) between 1 and 1000)
			)),
	CONSTRAINT "research_runs_lifecycle_check" CHECK((
				("research_runs"."status" = 'queued' and "research_runs"."started_at" is null and "research_runs"."finished_at" is null and "research_runs"."error_code" is null)
				or
				("research_runs"."status" in ('running', 'partial') and "research_runs"."started_at" is not null and "research_runs"."finished_at" is null and "research_runs"."error_code" is null)
				or
				("research_runs"."status" = 'completed' and "research_runs"."started_at" is not null and "research_runs"."finished_at" is not null and "research_runs"."error_code" is null)
				or
				("research_runs"."status" = 'failed' and "research_runs"."finished_at" is not null and "research_runs"."error_code" is not null)
				or
				("research_runs"."status" = 'cancelled' and "research_runs"."finished_at" is not null and "research_runs"."error_code" is null)
			))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_runs_id_request_scope_uidx` ON `research_runs` (`id`,`request_id`,`collection_id`,`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `research_runs_workflow_instance_uidx` ON `research_runs` (`workflow_instance_id`);--> statement-breakpoint
CREATE INDEX `research_runs_request_time_idx` ON `research_runs` (`request_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `research_runs_collection_status_idx` ON `research_runs` (`collection_id`,`status`);--> statement-breakpoint
CREATE TABLE `research_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`request_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`provider` text NOT NULL,
	`retrieved_at` integer NOT NULL,
	`extraction_status` text NOT NULL,
	`extraction_method` text NOT NULL,
	`extraction_metadata_json` text NOT NULL,
	`snapshot_json` text,
	`snapshot_expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`run_id`,`request_id`,`collection_id`,`workspace_id`) REFERENCES `research_runs`(`id`,`request_id`,`collection_id`,`workspace_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "research_sources_url_check" CHECK(length("research_sources"."url") between 8 and 2048 and lower("research_sources"."url") glob 'https://*'),
	CONSTRAINT "research_sources_title_check" CHECK("research_sources"."title" is null or length(trim("research_sources"."title")) between 1 and 240),
	CONSTRAINT "research_sources_provider_check" CHECK(length(trim("research_sources"."provider")) between 1 and 80),
	CONSTRAINT "research_sources_extraction_check" CHECK("research_sources"."extraction_status" in ('not_requested', 'not_allowed', 'completed', 'failed') and "research_sources"."extraction_method" in ('search', 'browser_run')),
	CONSTRAINT "research_sources_json_check" CHECK(json_valid("research_sources"."extraction_metadata_json") and ("research_sources"."snapshot_json" is null or json_valid("research_sources"."snapshot_json"))),
	CONSTRAINT "research_sources_expiry_check" CHECK("research_sources"."snapshot_expires_at" > "research_sources"."retrieved_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_sources_id_run_uidx` ON `research_sources` (`id`,`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `research_sources_run_url_uidx` ON `research_sources` (`run_id`,`url`);--> statement-breakpoint
CREATE INDEX `research_sources_snapshot_expiry_idx` ON `research_sources` (`snapshot_expires_at`);