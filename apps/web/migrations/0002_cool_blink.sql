CREATE TABLE `collaboration_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "collaboration_rate_limits_count_check" CHECK(typeof("collaboration_rate_limits"."count") = 'integer' and "collaboration_rate_limits"."count" > 0)
);
--> statement-breakpoint
CREATE INDEX `collaboration_rate_limits_updated_idx` ON `collaboration_rate_limits` (`updated_at`);--> statement-breakpoint
CREATE TABLE `invitation_acceptances` (
	`invitation_id` text PRIMARY KEY NOT NULL,
	`accepted_by_user_id` text NOT NULL,
	`accepted_at` integer NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `invitation_acceptances_user_idx` ON `invitation_acceptances` (`accepted_by_user_id`);--> statement-breakpoint
CREATE TABLE `invitation_collections` (
	`invitation_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`invitation_id`, `collection_id`),
	FOREIGN KEY (`invitation_id`,`workspace_id`) REFERENCES `invitations`(`id`,`workspace_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_id`,`workspace_id`) REFERENCES `collections`(`id`,`workspace_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invitation_collections_collection_idx` ON `invitation_collections` (`collection_id`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_email_normalized` text,
	`email_restriction_enabled` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`created_by_user_id` text NOT NULL,
	`revoked_at` integer,
	`revoked_by_user_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revoked_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "invitations_scope_type_check" CHECK("invitations"."scope_type" in ('workspace', 'collections')),
	CONSTRAINT "invitations_role_check" CHECK("invitations"."role" in ('viewer', 'commenter', 'contributor', 'editor', 'owner')),
	CONSTRAINT "invitations_token_hash_check" CHECK(length("invitations"."token_hash") = 64 and "invitations"."token_hash" = lower("invitations"."token_hash") and "invitations"."token_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "invitations_email_restriction_check" CHECK((
				("invitations"."email_restriction_enabled" = 0 and "invitations"."invited_email_normalized" is null)
				or
				("invitations"."email_restriction_enabled" = 1 and "invitations"."invited_email_normalized" is not null and "invitations"."invited_email_normalized" = lower(trim("invitations"."invited_email_normalized")) and length("invitations"."invited_email_normalized") between 3 and 320)
			)),
	CONSTRAINT "invitations_expiry_check" CHECK("invitations"."expires_at" > "invitations"."created_at"),
	CONSTRAINT "invitations_revocation_check" CHECK((
				("invitations"."revoked_at" is null and "invitations"."revoked_by_user_id" is null)
				or
				("invitations"."revoked_at" is not null and "invitations"."revoked_by_user_id" is not null)
			))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_hash_uidx` ON `invitations` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_id_workspace_uidx` ON `invitations` (`id`,`workspace_id`);--> statement-breakpoint
CREATE INDEX `invitations_workspace_state_idx` ON `invitations` (`workspace_id`,`revoked_at`,`expires_at`);