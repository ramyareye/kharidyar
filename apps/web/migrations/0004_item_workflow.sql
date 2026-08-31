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
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "decision_events_kind_check" CHECK("decision_events"."kind" in ('item_details_updated', 'item_status_changed')),
	CONSTRAINT "decision_events_payload_check" CHECK((
				("decision_events"."kind" = 'item_details_updated'
					and "decision_events"."before_snapshot_json" is not null
					and "decision_events"."after_snapshot_json" is not null
					and "decision_events"."from_status" is null
					and "decision_events"."to_status" is null
					and "decision_events"."transition_kind" is null
					and "decision_events"."note" is null)
				or
				("decision_events"."kind" = 'item_status_changed'
					and "decision_events"."before_snapshot_json" is null
					and "decision_events"."after_snapshot_json" is null
					and "decision_events"."from_status" is not null
					and "decision_events"."to_status" is not null
					and "decision_events"."from_status" <> "decision_events"."to_status"
					and "decision_events"."transition_kind" is not null)
			)),
	CONSTRAINT "decision_events_status_check" CHECK((
				("decision_events"."from_status" is null or "decision_events"."from_status" in ('idea', 'researching', 'comparing', 'decided', 'purchased', 'skipped'))
				and
				("decision_events"."to_status" is null or "decision_events"."to_status" in ('idea', 'researching', 'comparing', 'decided', 'purchased', 'skipped'))
			)),
	CONSTRAINT "decision_events_transition_kind_check" CHECK("decision_events"."transition_kind" is null or "decision_events"."transition_kind" in ('progression', 'alternate', 'reversal')),
	CONSTRAINT "decision_events_note_check" CHECK("decision_events"."note" is null or length(trim("decision_events"."note")) between 1 and 1000)
);
--> statement-breakpoint
CREATE INDEX `decision_events_item_time_idx` ON `decision_events` (`item_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `decision_events_actor_idx` ON `decision_events` (`actor_user_id`);--> statement-breakpoint
CREATE TRIGGER `decision_events_immutable_update`
BEFORE UPDATE ON `decision_events`
BEGIN
	SELECT RAISE(ABORT, 'decision_events are immutable');
END;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`collection_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`requirements` text,
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
	CONSTRAINT "items_title_length_check" CHECK(length(trim("__new_items"."title")) between 1 and 200),
	CONSTRAINT "items_requirements_length_check" CHECK("__new_items"."requirements" is null or length(trim("__new_items"."requirements")) between 1 and 4000),
	CONSTRAINT "items_priority_check" CHECK("__new_items"."priority" in ('essential', 'soon', 'nice_to_have')),
	CONSTRAINT "items_status_check" CHECK("__new_items"."status" in ('idea', 'researching', 'comparing', 'decided', 'purchased', 'skipped')),
	CONSTRAINT "items_quantity_needed_check" CHECK(typeof("__new_items"."quantity_needed") = 'integer' and "__new_items"."quantity_needed" between 1 and 9007199254740991),
	CONSTRAINT "items_group_label_check" CHECK("__new_items"."group_label" is null or length(trim("__new_items"."group_label")) between 1 and 80),
	CONSTRAINT "items_budget_pair_check" CHECK((
				("__new_items"."budget_minor" is null and "__new_items"."budget_currency" is null)
				or
				("__new_items"."budget_minor" is not null and typeof("__new_items"."budget_minor") = 'integer' and "__new_items"."budget_minor" between 0 and 9007199254740991 and "__new_items"."budget_currency" is not null and length("__new_items"."budget_currency") = 3 and "__new_items"."budget_currency" glob '[A-Z][A-Z][A-Z]')
			))
);
--> statement-breakpoint
INSERT INTO `__new_items`("id", "workspace_id", "collection_id", "title", "description", "requirements", "priority", "status", "quantity_needed", "group_label", "budget_minor", "budget_currency", "deadline_at", "created_by_user_id", "archived_at", "created_at", "updated_at") SELECT "id", "workspace_id", "collection_id", "title", "description", NULL, "priority", "status", "quantity_needed", "group_label", "budget_minor", "budget_currency", "deadline_at", "created_by_user_id", "archived_at", "created_at", "updated_at" FROM `items`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `items_id_workspace_uidx` ON `items` (`id`,`workspace_id`);--> statement-breakpoint
CREATE INDEX `items_collection_status_idx` ON `items` (`collection_id`,`status`);--> statement-breakpoint
CREATE INDEX `items_collection_group_idx` ON `items` (`collection_id`,`group_label`);
