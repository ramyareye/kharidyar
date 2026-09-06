CREATE TABLE `mcp_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`client_id` text NOT NULL,
	`session_id` text NOT NULL,
	`access_token_id` text NOT NULL,
	`operation_id` text NOT NULL,
	`operation` text NOT NULL,
	`input_hash` text NOT NULL,
	`arguments_json` text,
	`target_json` text,
	`status` text NOT NULL,
	`result_json` text,
	`error_code` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_actions_operation_idx` ON `mcp_actions` (`user_id`,`client_id`,`operation_id`);--> statement-breakpoint
CREATE INDEX `mcp_actions_user_created_idx` ON `mcp_actions` (`user_id`,`created_at`);