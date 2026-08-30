import { sql } from "drizzle-orm";
import { integer } from "drizzle-orm/sqlite-core";

const nowInMilliseconds = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const createdAt = () =>
	integer("created_at", { mode: "timestamp_ms" })
		.default(nowInMilliseconds)
		.notNull();

export const updatedAt = () =>
	integer("updated_at", { mode: "timestamp_ms" })
		.default(nowInMilliseconds)
		.$onUpdate(() => new Date())
		.notNull();
