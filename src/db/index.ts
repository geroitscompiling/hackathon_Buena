import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import { drizzleAppSchema } from "./drizzleTypes.ts";

const defaultDbUrl = "postgres://postgres:postgres@localhost:5433/buena";

function resolveDatabaseUrl(): string {
	const candidate = process.env.DATABASE_URL?.trim();
	if (!candidate) {
		return defaultDbUrl;
	}

	try {
		const parsed = new URL(candidate);
		if (parsed.protocol === "postgres:" || parsed.protocol === "postgresql:") {
			return candidate;
		}
	} catch {
		// Fall back to the repo-managed Postgres URL when a legacy SQLite path
		// remains in the env file.
	}

	return defaultDbUrl;
}

const dbUrl = resolveDatabaseUrl();

export const queryClient = postgres(dbUrl, {
	prepare: false,
});

export const db = drizzle(queryClient, {
	schema: drizzleAppSchema,
});
