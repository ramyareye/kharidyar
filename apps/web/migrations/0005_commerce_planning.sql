PRAGMA defer_foreign_keys = ON;--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`sales_channel` text DEFAULT 'online' NOT NULL,
	`website_url` text,
	`notes` text,
	`created_by_user_id` text NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "merchants_name_length_check" CHECK(length(trim("merchants"."name")) between 1 and 160),
	CONSTRAINT "merchants_sales_channel_check" CHECK("merchants"."sales_channel" in ('online', 'in_person', 'both')),
	CONSTRAINT "merchants_website_url_check" CHECK("merchants"."website_url" is null or (length("merchants"."website_url") between 8 and 2048 and lower("merchants"."website_url") glob 'https://*')),
	CONSTRAINT "merchants_notes_length_check" CHECK("merchants"."notes" is null or length(trim("merchants"."notes")) between 1 and 2000)
);--> statement-breakpoint
CREATE UNIQUE INDEX `merchants_id_workspace_uidx` ON `merchants` (`id`,`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `merchants_active_workspace_name_uidx` ON `merchants` (`workspace_id`,`name`) WHERE "merchants"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `merchants_workspace_name_idx` ON `merchants` (`workspace_id`,`name`);--> statement-breakpoint
INSERT INTO `merchants` (
	`id`, `workspace_id`, `name`, `sales_channel`, `website_url`, `notes`,
	`created_by_user_id`, `archived_at`, `created_at`, `updated_at`
)
SELECT
	'merchant-' || lower(hex(randomblob(16))),
	`workspace_id`,
	`seller_name`,
	'both',
	NULL,
	NULL,
	min(`created_by_user_id`),
	CASE WHEN count(`archived_at`) < count(*) THEN NULL ELSE max(`archived_at`) END,
	min(`created_at`),
	max(`updated_at`)
FROM `offers`
GROUP BY `workspace_id`, `seller_name`;--> statement-breakpoint
CREATE TABLE `__commerce_products_backup` AS SELECT * FROM `products`;--> statement-breakpoint
CREATE TABLE `__commerce_offers_backup` AS SELECT * FROM `offers`;--> statement-breakpoint
CREATE TABLE `__commerce_candidates_backup` AS SELECT * FROM `item_candidates`;--> statement-breakpoint
CREATE TABLE `__commerce_price_checks_backup` AS SELECT * FROM `price_checks`;--> statement-breakpoint
CREATE TABLE `__commerce_decisions_backup` AS SELECT * FROM `decision_events`;--> statement-breakpoint
DROP TRIGGER `decision_events_immutable_update`;--> statement-breakpoint
DROP TABLE `price_checks`;--> statement-breakpoint
DROP TABLE `item_candidates`;--> statement-breakpoint
DROP TABLE `offers`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
DROP TABLE `decision_events`;--> statement-breakpoint
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
	CONSTRAINT "products_title_length_check" CHECK(length(trim("products"."title")) between 1 and 240),
	CONSTRAINT "products_brand_length_check" CHECK("products"."brand" is null or length(trim("products"."brand")) between 1 and 160),
	CONSTRAINT "products_model_length_check" CHECK("products"."model" is null or length(trim("products"."model")) between 1 and 160),
	CONSTRAINT "products_category_length_check" CHECK("products"."category" is null or length(trim("products"."category")) between 1 and 120),
	CONSTRAINT "products_attributes_json_check" CHECK("products"."attributes_json" is null or json_valid("products"."attributes_json"))
);--> statement-breakpoint
CREATE UNIQUE INDEX `products_id_workspace_uidx` ON `products` (`id`,`workspace_id`);--> statement-breakpoint
CREATE INDEX `products_workspace_category_idx` ON `products` (`workspace_id`,`category`);--> statement-breakpoint
INSERT INTO `products` (
	`id`, `workspace_id`, `title`, `brand`, `model`, `category`, `attributes_json`,
	`created_by_user_id`, `archived_at`, `created_at`, `updated_at`
)
SELECT
	`id`, `workspace_id`, `title`, nullif(trim(`brand`), ''), nullif(trim(`model`), ''),
	nullif(trim(`category`), ''), `attributes_json`, `created_by_user_id`, `archived_at`,
	`created_at`, `updated_at`
FROM `__commerce_products_backup`;--> statement-breakpoint
CREATE TABLE `offers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`merchant_id` text NOT NULL,
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
	FOREIGN KEY (`merchant_id`,`workspace_id`) REFERENCES `merchants`(`id`,`workspace_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "offers_source_url_check" CHECK(length("offers"."source_url") between 8 and 2048 and lower("offers"."source_url") glob 'https://*'),
	CONSTRAINT "offers_price_check" CHECK((("offers"."price_kind" = 'unknown' and "offers"."unit_price_minor" is null) or ("offers"."price_kind" in ('exact', 'starting_at') and "offers"."unit_price_minor" is not null and typeof("offers"."unit_price_minor") = 'integer' and "offers"."unit_price_minor" between 0 and 9007199254740991 and "offers"."currency" is not null and length("offers"."currency") = 3 and "offers"."currency" glob '[A-Z][A-Z][A-Z]'))),
	CONSTRAINT "offers_currency_check" CHECK("offers"."currency" is null or (length("offers"."currency") = 3 and "offers"."currency" glob '[A-Z][A-Z][A-Z]')),
	CONSTRAINT "offers_shipping_amount_check" CHECK("offers"."shipping_minor" is null or (typeof("offers"."shipping_minor") = 'integer' and "offers"."shipping_minor" between 0 and 9007199254740991 and "offers"."currency" is not null)),
	CONSTRAINT "offers_shipping_basis_check" CHECK("offers"."shipping_basis" in ('per_line', 'per_unit', 'unknown')),
	CONSTRAINT "offers_availability_state_check" CHECK("offers"."availability_state" in ('available', 'unavailable', 'unknown')),
	CONSTRAINT "offers_availability_text_check" CHECK((("offers"."availability_channel" is null or length(trim("offers"."availability_channel")) between 1 and 80) and ("offers"."availability_location" is null or length(trim("offers"."availability_location")) between 1 and 160) and ("offers"."availability_variant" is null or length(trim("offers"."availability_variant")) between 1 and 160) and ("offers"."availability_note" is null or length(trim("offers"."availability_note")) between 1 and 1000)))
);--> statement-breakpoint
CREATE UNIQUE INDEX `offers_id_product_workspace_uidx` ON `offers` (`id`,`product_id`,`workspace_id`);--> statement-breakpoint
CREATE INDEX `offers_product_freshness_idx` ON `offers` (`product_id`,`last_checked_at`);--> statement-breakpoint
CREATE INDEX `offers_merchant_freshness_idx` ON `offers` (`merchant_id`,`last_checked_at`);--> statement-breakpoint
INSERT INTO `offers` (
	`id`, `workspace_id`, `product_id`, `merchant_id`, `source_url`, `price_kind`,
	`unit_price_minor`, `currency`, `shipping_minor`, `shipping_basis`,
	`availability_state`, `availability_channel`, `availability_location`,
	`availability_variant`, `availability_note`, `locale`, `last_checked_at`,
	`created_by_user_id`, `archived_at`, `created_at`, `updated_at`
)
SELECT
	o.`id`, o.`workspace_id`, o.`product_id`, m.`id`, o.`source_url`, o.`price_kind`,
	o.`unit_price_minor`, o.`currency`, o.`shipping_minor`, o.`shipping_basis`,
	o.`availability_state`, nullif(trim(o.`availability_channel`), ''),
	nullif(trim(o.`availability_location`), ''), nullif(trim(o.`availability_variant`), ''),
	nullif(trim(o.`availability_note`), ''), o.`locale`, o.`last_checked_at`,
	o.`created_by_user_id`, o.`archived_at`, o.`created_at`, o.`updated_at`
FROM `__commerce_offers_backup` o
JOIN `merchants` m
	ON m.`workspace_id` = o.`workspace_id` AND m.`name` = o.`seller_name`;--> statement-breakpoint
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
	CONSTRAINT "item_candidates_planned_offer_state_check" CHECK("item_candidates"."is_planned" = 1 or "item_candidates"."planned_offer_id" is null),
	CONSTRAINT "item_candidates_notes_length_check" CHECK("item_candidates"."notes" is null or length(trim("item_candidates"."notes")) between 1 and 4000),
	CONSTRAINT "item_candidates_rank_check" CHECK("item_candidates"."rank" is null or (typeof("item_candidates"."rank") = 'integer' and "item_candidates"."rank" between 0 and 1000))
);--> statement-breakpoint
CREATE UNIQUE INDEX `item_candidates_active_item_product_uidx` ON `item_candidates` (`item_id`,`product_id`) WHERE "item_candidates"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `item_candidates_one_planned_per_item_uidx` ON `item_candidates` (`item_id`) WHERE "item_candidates"."is_planned" = 1 and "item_candidates"."archived_at" is null;--> statement-breakpoint
CREATE INDEX `item_candidates_product_idx` ON `item_candidates` (`product_id`);--> statement-breakpoint
INSERT INTO `item_candidates` (
	`id`, `workspace_id`, `item_id`, `product_id`, `planned_purchase_quantity`,
	`is_planned`, `planned_offer_id`, `notes`, `rank`, `created_by_user_id`,
	`archived_at`, `created_at`, `updated_at`
)
SELECT
	`id`, `workspace_id`, `item_id`, `product_id`, `planned_purchase_quantity`,
	`is_planned`, `planned_offer_id`, nullif(trim(`notes`), ''), `rank`,
	`created_by_user_id`, `archived_at`, `created_at`, `updated_at`
FROM `__commerce_candidates_backup`;--> statement-breakpoint
CREATE TABLE `price_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`offer_id` text NOT NULL,
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
	`observed_at` integer NOT NULL,
	`observed_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`observed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "price_checks_price_check" CHECK((("price_checks"."price_kind" = 'unknown' and "price_checks"."unit_price_minor" is null) or ("price_checks"."price_kind" in ('exact', 'starting_at') and "price_checks"."unit_price_minor" is not null and typeof("price_checks"."unit_price_minor") = 'integer' and "price_checks"."unit_price_minor" between 0 and 9007199254740991 and "price_checks"."currency" is not null and length("price_checks"."currency") = 3 and "price_checks"."currency" glob '[A-Z][A-Z][A-Z]'))),
	CONSTRAINT "price_checks_currency_check" CHECK("price_checks"."currency" is null or (length("price_checks"."currency") = 3 and "price_checks"."currency" glob '[A-Z][A-Z][A-Z]')),
	CONSTRAINT "price_checks_shipping_amount_check" CHECK("price_checks"."shipping_minor" is null or (typeof("price_checks"."shipping_minor") = 'integer' and "price_checks"."shipping_minor" between 0 and 9007199254740991 and "price_checks"."currency" is not null)),
	CONSTRAINT "price_checks_shipping_basis_check" CHECK("price_checks"."shipping_basis" in ('per_line', 'per_unit', 'unknown')),
	CONSTRAINT "price_checks_availability_state_check" CHECK("price_checks"."availability_state" in ('available', 'unavailable', 'unknown')),
	CONSTRAINT "price_checks_availability_text_check" CHECK((("price_checks"."availability_channel" is null or length(trim("price_checks"."availability_channel")) between 1 and 80) and ("price_checks"."availability_location" is null or length(trim("price_checks"."availability_location")) between 1 and 160) and ("price_checks"."availability_variant" is null or length(trim("price_checks"."availability_variant")) between 1 and 160) and ("price_checks"."availability_note" is null or length(trim("price_checks"."availability_note")) between 1 and 1000)))
);--> statement-breakpoint
CREATE INDEX `price_checks_offer_observed_idx` ON `price_checks` (`offer_id`,`observed_at`);--> statement-breakpoint
CREATE TRIGGER `price_checks_immutable_update`
BEFORE UPDATE ON `price_checks`
BEGIN
	SELECT RAISE(ABORT, 'price_checks are immutable');
END;--> statement-breakpoint
INSERT INTO `price_checks` (
	`id`, `offer_id`, `price_kind`, `unit_price_minor`, `currency`, `shipping_minor`,
	`shipping_basis`, `availability_state`, `availability_channel`,
	`availability_location`, `availability_variant`, `availability_note`,
	`observed_at`, `observed_by_user_id`, `created_at`
)
SELECT
	`id`, `offer_id`, `price_kind`, `unit_price_minor`, `currency`, `shipping_minor`,
	`shipping_basis`, `availability_state`, NULL, NULL, NULL,
	nullif(trim(`availability_qualifier`), ''), `observed_at`, `observed_by_user_id`,
	`created_at`
FROM `__commerce_price_checks_backup`;--> statement-breakpoint
CREATE TABLE `decision_events` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`before_snapshot_json` text,
	`after_snapshot_json` text,
	`from_status` text,
	`to_status` text,
	`transition_kind` text,
	`note` text,
	`candidate_id` text,
	`offer_id` text,
	`price_check_id` text,
	`purchased_quantity` integer,
	`purchase_snapshot_json` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "decision_events_kind_check" CHECK("decision_events"."kind" in ('item_details_updated', 'item_status_changed', 'planned_candidate_changed', 'purchase_recorded')),
	CONSTRAINT "decision_events_payload_check" CHECK((("decision_events"."kind" = 'item_details_updated' and "decision_events"."before_snapshot_json" is not null and "decision_events"."after_snapshot_json" is not null and "decision_events"."from_status" is null and "decision_events"."to_status" is null and "decision_events"."transition_kind" is null and "decision_events"."note" is null and "decision_events"."candidate_id" is null and "decision_events"."offer_id" is null and "decision_events"."price_check_id" is null and "decision_events"."purchased_quantity" is null and "decision_events"."purchase_snapshot_json" is null) or ("decision_events"."kind" = 'item_status_changed' and "decision_events"."before_snapshot_json" is null and "decision_events"."after_snapshot_json" is null and "decision_events"."from_status" is not null and "decision_events"."to_status" is not null and "decision_events"."from_status" <> "decision_events"."to_status" and "decision_events"."transition_kind" is not null and "decision_events"."candidate_id" is null and "decision_events"."offer_id" is null and "decision_events"."price_check_id" is null and "decision_events"."purchased_quantity" is null and "decision_events"."purchase_snapshot_json" is null) or ("decision_events"."kind" = 'planned_candidate_changed' and ("decision_events"."before_snapshot_json" is not null or "decision_events"."after_snapshot_json" is not null) and "decision_events"."from_status" is null and "decision_events"."to_status" is null and "decision_events"."transition_kind" is null and "decision_events"."note" is null and "decision_events"."candidate_id" is null and "decision_events"."offer_id" is null and "decision_events"."price_check_id" is null and "decision_events"."purchased_quantity" is null and "decision_events"."purchase_snapshot_json" is null) or ("decision_events"."kind" = 'purchase_recorded' and "decision_events"."before_snapshot_json" is null and "decision_events"."after_snapshot_json" is null and "decision_events"."from_status" is null and "decision_events"."to_status" is null and "decision_events"."transition_kind" is null and "decision_events"."note" is null and "decision_events"."candidate_id" is not null and "decision_events"."offer_id" is not null and "decision_events"."price_check_id" is not null and "decision_events"."purchased_quantity" is not null and "decision_events"."purchase_snapshot_json" is not null))),
	CONSTRAINT "decision_events_status_check" CHECK((("decision_events"."from_status" is null or "decision_events"."from_status" in ('idea', 'researching', 'comparing', 'decided', 'purchased', 'skipped')) and ("decision_events"."to_status" is null or "decision_events"."to_status" in ('idea', 'researching', 'comparing', 'decided', 'purchased', 'skipped')))),
	CONSTRAINT "decision_events_transition_kind_check" CHECK("decision_events"."transition_kind" is null or "decision_events"."transition_kind" in ('progression', 'alternate', 'reversal')),
	CONSTRAINT "decision_events_note_check" CHECK("decision_events"."note" is null or length(trim("decision_events"."note")) between 1 and 1000),
	CONSTRAINT "decision_events_purchase_quantity_check" CHECK("decision_events"."purchased_quantity" is null or (typeof("decision_events"."purchased_quantity") = 'integer' and "decision_events"."purchased_quantity" between 1 and 9007199254740991))
);--> statement-breakpoint
CREATE INDEX `decision_events_item_time_idx` ON `decision_events` (`item_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `decision_events_actor_idx` ON `decision_events` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `decision_events_candidate_purchase_idx` ON `decision_events` (`candidate_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `decision_events_offer_purchase_idx` ON `decision_events` (`offer_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `decision_events_immutable_update`
BEFORE UPDATE ON `decision_events`
BEGIN
	SELECT RAISE(ABORT, 'decision_events are immutable');
END;--> statement-breakpoint
INSERT INTO `decision_events` (
	`id`, `item_id`, `kind`, `actor_user_id`, `before_snapshot_json`,
	`after_snapshot_json`, `from_status`, `to_status`, `transition_kind`, `note`,
	`candidate_id`, `offer_id`, `price_check_id`, `purchased_quantity`,
	`purchase_snapshot_json`, `created_at`
)
SELECT
	`id`, `item_id`, `kind`, `actor_user_id`, `before_snapshot_json`,
	`after_snapshot_json`, `from_status`, `to_status`, `transition_kind`, `note`,
	NULL, NULL, NULL, NULL, NULL, `created_at`
FROM `__commerce_decisions_backup`;--> statement-breakpoint
DROP TABLE `__commerce_products_backup`;--> statement-breakpoint
DROP TABLE `__commerce_offers_backup`;--> statement-breakpoint
DROP TABLE `__commerce_candidates_backup`;--> statement-breakpoint
DROP TABLE `__commerce_price_checks_backup`;--> statement-breakpoint
DROP TABLE `__commerce_decisions_backup`;--> statement-breakpoint
PRAGMA foreign_key_check;--> statement-breakpoint
PRAGMA defer_foreign_keys = OFF;
