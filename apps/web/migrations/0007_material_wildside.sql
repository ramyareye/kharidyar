CREATE TABLE `import_draft_applications` (
	`draft_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`proposal_key` text NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`draft_id`, `proposal_key`, `record_type`),
	FOREIGN KEY (`draft_id`,`collection_id`,`workspace_id`) REFERENCES `import_drafts`(`id`,`collection_id`,`workspace_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "import_draft_applications_record_type_check" CHECK("import_draft_applications"."record_type" in ('item', 'product', 'candidate', 'merchant', 'offer', 'price_check')),
	CONSTRAINT "import_draft_applications_action_check" CHECK("import_draft_applications"."action" in ('created', 'reused')),
	CONSTRAINT "import_draft_applications_identifier_check" CHECK(length(trim("import_draft_applications"."proposal_key")) between 1 and 80 and length(trim("import_draft_applications"."record_id")) between 1 and 200)
);
--> statement-breakpoint
CREATE INDEX `import_draft_applications_record_idx` ON `import_draft_applications` (`record_type`,`record_id`);--> statement-breakpoint
CREATE TABLE `import_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`format` text NOT NULL,
	`parser_version` text NOT NULL,
	`proposal_json` text NOT NULL,
	`warnings_json` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`raw_input` text,
	`created_by_user_id` text NOT NULL,
	`applied_by_user_id` text,
	`applied_at` integer,
	`discarded_by_user_id` text,
	`discarded_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`applied_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`discarded_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`collection_id`,`workspace_id`) REFERENCES `collections`(`id`,`workspace_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "import_drafts_format_check" CHECK("import_drafts"."format" in ('markdown', 'json')),
	CONSTRAINT "import_drafts_parser_version_check" CHECK(length(trim("import_drafts"."parser_version")) between 1 and 40),
	CONSTRAINT "import_drafts_payload_check" CHECK(json_valid("import_drafts"."proposal_json") and json_valid("import_drafts"."warnings_json")),
	CONSTRAINT "import_drafts_raw_input_check" CHECK("import_drafts"."raw_input" is null or length("import_drafts"."raw_input") between 1 and 100000),
	CONSTRAINT "import_drafts_lifecycle_check" CHECK((
				("import_drafts"."status" = 'draft'
					and "import_drafts"."raw_input" is not null
					and "import_drafts"."applied_by_user_id" is null
					and "import_drafts"."applied_at" is null
					and "import_drafts"."discarded_by_user_id" is null
					and "import_drafts"."discarded_at" is null)
				or
				("import_drafts"."status" = 'applied'
					and "import_drafts"."raw_input" is null
					and "import_drafts"."applied_by_user_id" is not null
					and "import_drafts"."applied_at" is not null
					and "import_drafts"."discarded_by_user_id" is null
					and "import_drafts"."discarded_at" is null)
				or
				("import_drafts"."status" = 'discarded'
					and "import_drafts"."raw_input" is null
					and "import_drafts"."applied_by_user_id" is null
					and "import_drafts"."applied_at" is null
					and "import_drafts"."discarded_by_user_id" is not null
					and "import_drafts"."discarded_at" is not null)
			))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_drafts_id_collection_workspace_uidx` ON `import_drafts` (`id`,`collection_id`,`workspace_id`);--> statement-breakpoint
CREATE INDEX `import_drafts_collection_time_idx` ON `import_drafts` (`collection_id`,`created_at`,`id`);