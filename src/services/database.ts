import type { AppDrizzleDatabase } from "#/db/drizzleTypes.ts";
import { db } from "#/db/index";

export type AppDatabase = AppDrizzleDatabase;

export { db };
