import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as relations from "./relations.ts";
import * as schema from "./schema.ts";

/** Single schema object for Drizzle generics (production postgres-js + test PGlite). */
export const drizzleAppSchema = { ...schema, ...relations };
export type DrizzleAppSchema = typeof drizzleAppSchema;

export type AppDrizzleDatabase =
	| PostgresJsDatabase<DrizzleAppSchema>
	| PgliteDatabase<DrizzleAppSchema>;
