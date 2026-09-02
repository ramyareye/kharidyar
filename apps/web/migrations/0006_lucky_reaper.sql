CREATE TABLE `candidate_votes` (
	`workspace_id` text NOT NULL,
	`item_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`candidate_id`, `user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`,`item_id`,`workspace_id`) REFERENCES `item_candidates`(`id`,`item_id`,`workspace_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `candidate_votes_item_idx` ON `candidate_votes` (`item_id`,`candidate_id`);--> statement-breakpoint
CREATE INDEX `candidate_votes_user_idx` ON `candidate_votes` (`user_id`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`item_id` text NOT NULL,
	`candidate_id` text,
	`body` text,
	`author_user_id` text NOT NULL,
	`resolved_at` integer,
	`resolved_by_user_id` text,
	`removed_at` integer,
	`removed_by_user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`removed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`item_id`,`workspace_id`) REFERENCES `items`(`id`,`workspace_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_id`,`item_id`,`workspace_id`) REFERENCES `item_candidates`(`id`,`item_id`,`workspace_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "comments_target_check" CHECK("comments"."candidate_id" is null or length("comments"."candidate_id") > 0),
	CONSTRAINT "comments_body_state_check" CHECK((
				("comments"."removed_at" is null and "comments"."removed_by_user_id" is null and "comments"."body" is not null and length(trim("comments"."body")) between 1 and 2000)
				or
				("comments"."removed_at" is not null and "comments"."removed_by_user_id" is not null and "comments"."body" is null)
			)),
	CONSTRAINT "comments_resolution_pair_check" CHECK((
				("comments"."resolved_at" is null and "comments"."resolved_by_user_id" is null)
				or
				("comments"."resolved_at" is not null and "comments"."resolved_by_user_id" is not null)
			))
);
--> statement-breakpoint
CREATE INDEX `comments_item_time_idx` ON `comments` (`item_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `comments_candidate_time_idx` ON `comments` (`candidate_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `comments_author_idx` ON `comments` (`author_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `item_candidates_id_item_workspace_uidx` ON `item_candidates` (`id`,`item_id`,`workspace_id`);