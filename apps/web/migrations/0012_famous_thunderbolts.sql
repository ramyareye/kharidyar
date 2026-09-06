CREATE TABLE `local_codex_jobs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`pairing_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`lease_token_hash` text,
	`lease_expires_at` integer,
	`finished_at` integer,
	`completion_hash` text,
	FOREIGN KEY (`run_id`) REFERENCES `research_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pairing_id`) REFERENCES `local_codex_pairings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_codex_jobs_one_active_idx` ON `local_codex_jobs` (`pairing_id`) WHERE "local_codex_jobs"."finished_at" is null;--> statement-breakpoint
CREATE TABLE `local_codex_pairings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_codex_pairings_token_hash_unique` ON `local_codex_pairings` (`token_hash`);--> statement-breakpoint
CREATE INDEX `local_codex_pairings_user_idx` ON `local_codex_pairings` (`user_id`);--> statement-breakpoint
-- Preserve all cascading descendants before replacing the provider constraint.
-- D1 executes this migration transactionally with foreign keys enabled.
CREATE TABLE `__local_backup_research_sources` AS SELECT * FROM `research_sources`;--> statement-breakpoint
CREATE TABLE `__local_backup_research_results` AS SELECT * FROM `research_results`;--> statement-breakpoint
CREATE TABLE `__local_backup_research_result_promotions` AS SELECT * FROM `research_result_promotions`;--> statement-breakpoint
CREATE TABLE `__new_research_runs` (
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
	CONSTRAINT "research_runs_status_check" CHECK("__new_research_runs"."status" in ('queued', 'running', 'partial', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "research_runs_provider_check" CHECK("__new_research_runs"."provider" in ('tavily-basic-v1', 'local-codex-v1')),
	CONSTRAINT "research_runs_query_check" CHECK(length(trim("__new_research_runs"."provider_query")) between 1 and 2000),
	CONSTRAINT "research_runs_error_pair_check" CHECK((
				("__new_research_runs"."error_code" is null and "__new_research_runs"."error_message" is null)
				or
				("__new_research_runs"."error_code" is not null and length(trim("__new_research_runs"."error_code")) between 1 and 80 and "__new_research_runs"."error_message" is not null and length(trim("__new_research_runs"."error_message")) between 1 and 1000)
			)),
	CONSTRAINT "research_runs_lifecycle_check" CHECK((
				("__new_research_runs"."status" = 'queued' and "__new_research_runs"."started_at" is null and "__new_research_runs"."finished_at" is null and "__new_research_runs"."error_code" is null)
				or
				("__new_research_runs"."status" in ('running', 'partial') and "__new_research_runs"."started_at" is not null and "__new_research_runs"."finished_at" is null and "__new_research_runs"."error_code" is null)
				or
				("__new_research_runs"."status" = 'completed' and "__new_research_runs"."started_at" is not null and "__new_research_runs"."finished_at" is not null and "__new_research_runs"."error_code" is null)
				or
				("__new_research_runs"."status" = 'failed' and "__new_research_runs"."finished_at" is not null and "__new_research_runs"."error_code" is not null)
				or
				("__new_research_runs"."status" = 'cancelled' and "__new_research_runs"."finished_at" is not null and "__new_research_runs"."error_code" is null)
			))
);
--> statement-breakpoint
INSERT INTO `__new_research_runs`("id", "request_id", "workspace_id", "collection_id", "status", "provider", "provider_query", "workflow_instance_id", "error_code", "error_message", "requested_by_user_id", "started_at", "finished_at", "created_at", "updated_at") SELECT "id", "request_id", "workspace_id", "collection_id", "status", "provider", "provider_query", "workflow_instance_id", "error_code", "error_message", "requested_by_user_id", "started_at", "finished_at", "created_at", "updated_at" FROM `research_runs`;--> statement-breakpoint
DROP TABLE `research_runs`;--> statement-breakpoint
ALTER TABLE `__new_research_runs` RENAME TO `research_runs`;--> statement-breakpoint
CREATE UNIQUE INDEX `research_runs_id_request_scope_uidx` ON `research_runs` (`id`,`request_id`,`collection_id`,`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `research_runs_workflow_instance_uidx` ON `research_runs` (`workflow_instance_id`);--> statement-breakpoint
CREATE INDEX `research_runs_request_time_idx` ON `research_runs` (`request_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `research_runs_collection_status_idx` ON `research_runs` (`collection_id`,`status`);
--> statement-breakpoint
INSERT INTO `research_sources` SELECT * FROM `__local_backup_research_sources`;
--> statement-breakpoint
INSERT INTO `research_results` SELECT * FROM `__local_backup_research_results`;
--> statement-breakpoint
INSERT INTO `research_result_promotions` SELECT * FROM `__local_backup_research_result_promotions`;
--> statement-breakpoint
DROP TABLE `__local_backup_research_result_promotions`;
--> statement-breakpoint
DROP TABLE `__local_backup_research_results`;
--> statement-breakpoint
DROP TABLE `__local_backup_research_sources`;
