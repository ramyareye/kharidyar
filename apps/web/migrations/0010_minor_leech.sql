CREATE TABLE `concept_images` (
	`id` text PRIMARY KEY NOT NULL,
	`concept_id` text NOT NULL,
	`role` text NOT NULL,
	`subject_kind` text,
	`parent_image_id` text,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`original_filename` text NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`sha256` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`caption` text,
	`contains_person` integer DEFAULT false NOT NULL,
	`person_rights_confirmed_at` integer,
	`uploaded_by_user_id` text NOT NULL,
	`is_cover` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`deleted_by_user_id` text,
	`object_deleted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`deleted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_image_id`,`concept_id`) REFERENCES `concept_images`(`id`,`concept_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "concept_images_role_check" CHECK("concept_images"."role" in ('base', 'reference', 'edited')),
	CONSTRAINT "concept_images_subject_check" CHECK((
				("concept_images"."role" = 'base' and "concept_images"."subject_kind" in ('space', 'person'))
				or
				("concept_images"."role" <> 'base' and "concept_images"."subject_kind" is null)
			)),
	CONSTRAINT "concept_images_parent_check" CHECK((
				("concept_images"."role" = 'edited' and "concept_images"."parent_image_id" is not null)
				or
				("concept_images"."role" <> 'edited' and "concept_images"."parent_image_id" is null)
			)),
	CONSTRAINT "concept_images_content_type_check" CHECK("concept_images"."content_type" = 'image/webp'),
	CONSTRAINT "concept_images_filename_check" CHECK(length(trim("concept_images"."original_filename")) between 1 and 255),
	CONSTRAINT "concept_images_size_check" CHECK(typeof("concept_images"."byte_size") = 'integer' and "concept_images"."byte_size" > 0),
	CONSTRAINT "concept_images_dimensions_check" CHECK(typeof("concept_images"."width") = 'integer' and "concept_images"."width" > 0 and typeof("concept_images"."height") = 'integer' and "concept_images"."height" > 0),
	CONSTRAINT "concept_images_sha256_check" CHECK(length("concept_images"."sha256") = 64 and "concept_images"."sha256" = lower("concept_images"."sha256") and "concept_images"."sha256" not glob '*[^0-9a-f]*'),
	CONSTRAINT "concept_images_position_check" CHECK(typeof("concept_images"."position") = 'integer' and "concept_images"."position" >= 0),
	CONSTRAINT "concept_images_caption_check" CHECK("concept_images"."caption" is null or length(trim("concept_images"."caption")) between 1 and 500),
	CONSTRAINT "concept_images_person_rights_check" CHECK((
				("concept_images"."contains_person" = 0 and "concept_images"."person_rights_confirmed_at" is null and "concept_images"."subject_kind" <> 'person')
				or
				("concept_images"."contains_person" = 1 and "concept_images"."person_rights_confirmed_at" is not null)
			)),
	CONSTRAINT "concept_images_deletion_check" CHECK((
				("concept_images"."deleted_at" is null and "concept_images"."deleted_by_user_id" is null and "concept_images"."object_deleted_at" is null)
				or
				("concept_images"."deleted_at" is not null and "concept_images"."deleted_by_user_id" is not null and ("concept_images"."object_deleted_at" is null or "concept_images"."object_deleted_at" >= "concept_images"."deleted_at"))
			))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `concept_images_id_concept_uidx` ON `concept_images` (`id`,`concept_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `concept_images_object_key_uidx` ON `concept_images` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `concept_images_active_base_uidx` ON `concept_images` (`concept_id`) WHERE "concept_images"."role" = 'base' and "concept_images"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `concept_images_active_cover_uidx` ON `concept_images` (`concept_id`) WHERE "concept_images"."is_cover" = 1 and "concept_images"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX `concept_images_concept_order_idx` ON `concept_images` (`concept_id`,`role`,`position`,`created_at`);--> statement-breakpoint
CREATE INDEX `concept_images_uploader_idx` ON `concept_images` (`uploaded_by_user_id`);--> statement-breakpoint
CREATE INDEX `concept_images_pending_object_delete_idx` ON `concept_images` (`deleted_at`,`object_deleted_at`);