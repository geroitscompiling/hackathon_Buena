import { drizzle } from "drizzle-orm/better-sqlite3";

import * as relations from "./relations.ts";
import * as schema from "./schema.ts";

const dbUrl = process.env.DATABASE_URL ?? "local.db";

export const db = drizzle(dbUrl, {
	schema: {
		...schema,
		...relations,
	},
});
