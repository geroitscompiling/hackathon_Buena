import { vi } from "vitest";

vi.mock("#/db/index", async () => {
	const { PGlite } = await vi.importActual<typeof import("@electric-sql/pglite")>(
		"@electric-sql/pglite",
	);
	const { vector } = await vi.importActual<
		typeof import("@electric-sql/pglite/vector")
	>("@electric-sql/pglite/vector");
	const { drizzle } = await vi.importActual<
		typeof import("drizzle-orm/pglite")
	>("drizzle-orm/pglite");
	const relations = await vi.importActual<typeof import("#/db/relations")>(
		"#/db/relations",
	);
	const schema = await vi.importActual<typeof import("#/db/schema")>(
		"#/db/schema",
	);
	const { bootstrapAppSchema } = await vi.importActual<
		typeof import("#/test/postgresTestDb")
	>("#/test/postgresTestDb");

	const rawClient = new PGlite({
		extensions: { vector },
	});
	await bootstrapAppSchema(rawClient);

	const queryClient = Object.assign(rawClient, {
		end: async () => {
			await rawClient.close();
		},
	});

	const db = drizzle(queryClient, {
		schema: {
			...schema,
			...relations,
		},
	});

	return { db, queryClient };
});

vi.mock("#/services/database", async () => {
	const databaseModule = await import("#/db/index");
	return { db: databaseModule.db };
});
