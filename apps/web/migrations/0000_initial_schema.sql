-- Initial Better Auth, collaboration, and purchase-planning schema.
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_accountId_uidx` ON `account` (`issuer`,`account_id`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `collection_brief_colors` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_brief_id` text NOT NULL,
	`kind` text NOT NULL,
	`position` integer NOT NULL,
	`hex` text NOT NULL,
	`label` text,
	`usage_note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`collection_brief_id`) REFERENCES `collection_briefs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "collection_brief_colors_kind_check" CHECK("collection_brief_colors"."kind" in ('core', 'supporting')),
	CONSTRAINT "collection_brief_colors_position_check" CHECK(typeof("collection_brief_colors"."position") = 'integer' and "collection_brief_colors"."position" between 0 and 5),
	CONSTRAINT "collection_brief_colors_hex_check" CHECK(length("collection_brief_colors"."hex") = 7 and "collection_brief_colors"."hex" glob '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_brief_colors_kind_position_uidx` ON `collection_brief_colors` (`collection_brief_id`,`kind`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_brief_colors_hex_uidx` ON `collection_brief_colors` (`collection_brief_id`,`hex`);--> statement-breakpoint
CREATE TABLE `collection_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`title` text,
	`description` text,
	`budget_minor` integer,
	`budget_currency` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "collection_briefs_budget_pair_check" CHECK((
				("collection_briefs"."budget_minor" is null and "collection_briefs"."budget_currency" is null)
				or
				("collection_briefs"."budget_minor" is not null and typeof("collection_briefs"."budget_minor") = 'integer' and "collection_briefs"."budget_minor" between 0 and 9007199254740991 and "collection_briefs"."budget_currency" is not null and length("collection_briefs"."budget_currency") = 3 and "collection_briefs"."budget_currency" glob '[A-Z][A-Z][A-Z]')
			))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_briefs_collection_uidx` ON `collection_briefs` (`collection_id`);--> statement-breakpoint
CREATE TABLE `collection_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "collection_memberships_role_check" CHECK("collection_memberships"."role" in ('viewer', 'commenter', 'contributor', 'editor', 'owner'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_memberships_collection_user_uidx` ON `collection_memberships` (`collection_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `collection_memberships_user_idx` ON `collection_memberships` (`user_id`);--> statement-breakpoint
CREATE INDEX `collection_memberships_collection_role_idx` ON `collection_memberships` (`collection_id`,`role`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_by_user_id` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "collections_name_length_check" CHECK(length(trim("collections"."name")) between 1 and 120)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_id_workspace_uidx` ON `collections` (`id`,`workspace_id`);--> statement-breakpoint
CREATE INDEX `collections_workspace_archived_idx` ON `collections` (`workspace_id`,`archived_at`);--> statement-breakpoint
CREATE TABLE `workspace_memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workspace_memberships_role_check" CHECK("workspace_memberships"."role" in ('viewer', 'commenter', 'contributor', 'editor', 'owner'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_memberships_workspace_user_uidx` ON `workspace_memberships` (`workspace_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `workspace_memberships_user_idx` ON `workspace_memberships` (`user_id`);--> statement-breakpoint
CREATE INDEX `workspace_memberships_workspace_role_idx` ON `workspace_memberships` (`workspace_id`,`role`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "workspaces_name_length_check" CHECK(length(trim("workspaces"."name")) between 1 and 120)
);
--> statement-breakpoint
CREATE INDEX `workspaces_created_by_user_idx` ON `workspaces` (`created_by_user_id`);--> statement-breakpoint
CREATE TABLE `item_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`item_id` text NOT NULL,
	`product_id` text NOT NULL,
	`planned_purchase_quantity` integer DEFAULT 1 NOT NULL,
	`is_planned` integer DEFAULT false NOT NULL,
	`planned_offer_id` text,
	`notes` text,
	`rank` integer,
	`created_by_user_id` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`item_id`,`workspace_id`) REFERENCES `items`(`id`,`workspace_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`,`workspace_id`) REFERENCES `products`(`id`,`workspace_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`planned_offer_id`,`product_id`,`workspace_id`) REFERENCES `offers`(`id`,`product_id`,`workspace_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "item_candidates_planned_quantity_check" CHECK(typeof("item_candidates"."planned_purchase_quantity") = 'integer' and "item_candidates"."planned_purchase_quantity" between 1 and 9007199254740991),
	CONSTRAINT "item_candidates_is_planned_check" CHECK("item_candidates"."is_planned" in (0, 1)),
	CONSTRAINT "item_candidates_planned_offer_state_check" CHECK("item_candidates"."is_planned" = 1 or "item_candidates"."planned_offer_id" is null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_candidates_active_item_product_uidx` ON `item_candidates` (`item_id`,`product_id`) WHERE "item_candidates"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `item_candidates_one_planned_per_item_uidx` ON `item_candidates` (`item_id`) WHERE "item_candidates"."is_planned" = 1 and "item_candidates"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `item_candidates_product_idx` ON `item_candidates` (`product_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`priority` text DEFAULT 'nice_to_have' NOT NULL,
	`status` text DEFAULT 'idea' NOT NULL,
	`quantity_needed` integer DEFAULT 1 NOT NULL,
	`group_label` text,
	`budget_minor` integer,
	`budget_currency` text,
	`deadline_at` integer,
	`created_by_user_id` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`collection_id`,`workspace_id`) REFERENCES `collections`(`id`,`workspace_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "items_title_length_check" CHECK(length(trim("items"."title")) between 1 and 200),
	CONSTRAINT "items_priority_check" CHECK("items"."priority" in ('essential', 'soon', 'nice_to_have')),
	CONSTRAINT "items_status_check" CHECK("items"."status" in ('idea', 'researching', 'comparing', 'decided', 'purchased', 'skipped')),
	CONSTRAINT "items_quantity_needed_check" CHECK(typeof("items"."quantity_needed") = 'integer' and "items"."quantity_needed" between 1 and 9007199254740991),
	CONSTRAINT "items_group_label_check" CHECK("items"."group_label" is null or length(trim("items"."group_label")) between 1 and 80),
	CONSTRAINT "items_budget_pair_check" CHECK((
				("items"."budget_minor" is null and "items"."budget_currency" is null)
				or
				("items"."budget_minor" is not null and typeof("items"."budget_minor") = 'integer' and "items"."budget_minor" between 0 and 9007199254740991 and "items"."budget_currency" is not null and length("items"."budget_currency") = 3 and "items"."budget_currency" glob '[A-Z][A-Z][A-Z]')
			))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_id_workspace_uidx` ON `items` (`id`,`workspace_id`);--> statement-breakpoint
CREATE INDEX `items_collection_status_idx` ON `items` (`collection_id`,`status`);--> statement-breakpoint
CREATE INDEX `items_collection_group_idx` ON `items` (`collection_id`,`group_label`);--> statement-breakpoint
CREATE TABLE `offers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`seller_name` text NOT NULL,
	`source_url` text NOT NULL,
	`price_kind` text NOT NULL,
	`unit_price_minor` integer,
	`currency` text,
	`shipping_minor` integer,
	`shipping_basis` text NOT NULL,
	`availability_state` text NOT NULL,
	`availability_channel` text,
	`availability_location` text,
	`availability_variant` text,
	`availability_note` text,
	`locale` text,
	`last_checked_at` integer NOT NULL,
	`created_by_user_id` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`product_id`,`workspace_id`) REFERENCES `products`(`id`,`workspace_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "offers_seller_name_check" CHECK(length(trim("offers"."seller_name")) between 1 and 160),
	CONSTRAINT "offers_price_check" CHECK((
				("offers"."price_kind" = 'unknown' and "offers"."unit_price_minor" is null)
				or
				("offers"."price_kind" in ('exact', 'starting_at') and "offers"."unit_price_minor" is not null and typeof("offers"."unit_price_minor") = 'integer' and "offers"."unit_price_minor" between 0 and 9007199254740991 and "offers"."currency" is not null and length("offers"."currency") = 3 and "offers"."currency" glob '[A-Z][A-Z][A-Z]')
			)),
	CONSTRAINT "offers_currency_check" CHECK("offers"."currency" is null or (length("offers"."currency") = 3 and "offers"."currency" glob '[A-Z][A-Z][A-Z]')),
	CONSTRAINT "offers_shipping_amount_check" CHECK("offers"."shipping_minor" is null or (typeof("offers"."shipping_minor") = 'integer' and "offers"."shipping_minor" between 0 and 9007199254740991 and "offers"."currency" is not null)),
	CONSTRAINT "offers_shipping_basis_check" CHECK("offers"."shipping_basis" in ('per_line', 'per_unit', 'unknown')),
	CONSTRAINT "offers_availability_state_check" CHECK("offers"."availability_state" in ('available', 'unavailable', 'unknown'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offers_id_product_workspace_uidx` ON `offers` (`id`,`product_id`,`workspace_id`);--> statement-breakpoint
CREATE INDEX `offers_product_freshness_idx` ON `offers` (`product_id`,`last_checked_at`);--> statement-breakpoint
CREATE TABLE `price_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`offer_id` text NOT NULL,
	`price_kind` text NOT NULL,
	`unit_price_minor` integer,
	`currency` text,
	`shipping_minor` integer,
	`shipping_basis` text NOT NULL,
	`availability_state` text NOT NULL,
	`availability_qualifier` text,
	`observed_at` integer NOT NULL,
	`observed_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`observed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "price_checks_price_check" CHECK((
				("price_checks"."price_kind" = 'unknown' and "price_checks"."unit_price_minor" is null)
				or
				("price_checks"."price_kind" in ('exact', 'starting_at') and "price_checks"."unit_price_minor" is not null and typeof("price_checks"."unit_price_minor") = 'integer' and "price_checks"."unit_price_minor" between 0 and 9007199254740991 and "price_checks"."currency" is not null and length("price_checks"."currency") = 3 and "price_checks"."currency" glob '[A-Z][A-Z][A-Z]')
			)),
	CONSTRAINT "price_checks_currency_check" CHECK("price_checks"."currency" is null or (length("price_checks"."currency") = 3 and "price_checks"."currency" glob '[A-Z][A-Z][A-Z]')),
	CONSTRAINT "price_checks_shipping_amount_check" CHECK("price_checks"."shipping_minor" is null or (typeof("price_checks"."shipping_minor") = 'integer' and "price_checks"."shipping_minor" between 0 and 9007199254740991 and "price_checks"."currency" is not null)),
	CONSTRAINT "price_checks_shipping_basis_check" CHECK("price_checks"."shipping_basis" in ('per_line', 'per_unit', 'unknown')),
	CONSTRAINT "price_checks_availability_state_check" CHECK("price_checks"."availability_state" in ('available', 'unavailable', 'unknown'))
);
--> statement-breakpoint
CREATE INDEX `price_checks_offer_observed_idx` ON `price_checks` (`offer_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`brand` text,
	`model` text,
	`category` text,
	`attributes_json` text,
	`created_by_user_id` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "products_title_length_check" CHECK(length(trim("products"."title")) between 1 and 240)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_id_workspace_uidx` ON `products` (`id`,`workspace_id`);--> statement-breakpoint
CREATE INDEX `products_workspace_category_idx` ON `products` (`workspace_id`,`category`);
