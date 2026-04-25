import { integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const properties = sqliteTable("properties", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
});

export const houses = sqliteTable("houses", {
	id: text("id").primaryKey(),
	propertyId: text("propertyId")
		.notNull()
		.references(() => properties.id),
	name: text("name").notNull(),
});

export const apartments = sqliteTable("apartments", {
	id: text("id").primaryKey(),
	houseId: text("houseId")
		.notNull()
		.references(() => houses.id),
	name: text("name").notNull(),
});

export const users = sqliteTable("users", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email"),
});

export const sources = sqliteTable("sources", {
	id: text("id").primaryKey(),
	fileId: text("fileId").notNull(),
	fileType: text("fileType").notNull(),
	ingestionDate: text("ingestionDate").notNull(),
	documentDate: text("documentDate"),
	anchorReference: text("anchorReference"),
});

export const facts = sqliteTable("facts", {
	id: text("id").primaryKey(),
	propertyId: text("propertyId")
		.notNull()
		.references(() => properties.id),
	category: text("category").notNull(),
	key: text("key").notNull(),
	value: text("value").notNull(),
	sourceId: text("sourceId")
		.notNull()
		.references(() => sources.id),
	isGoldStandard: integer("isGoldStandard", { mode: "boolean" }).notNull(),
	confidenceScore: real("confidenceScore").notNull(),
});

export const cases = sqliteTable(
	"cases",
	{
		id: text("id").primaryKey(),
		propertyId: text("propertyId")
			.notNull()
			.references(() => properties.id),
		houseId: text("houseId").references(() => houses.id),
		apartmentId: text("apartmentId").references(() => apartments.id),
		ownerUserId: text("ownerUserId")
			.notNull()
			.references(() => users.id),
		caseKey: text("caseKey").notNull(),
		closurePredicate: text("closurePredicate"),
		title: text("title").notNull(),
		summary: text("summary").notNull(),
		status: text("status").notNull(),
		createdAt: text("createdAt").notNull(),
		updatedAt: text("updatedAt").notNull(),
	},
	(table) => [uniqueIndex("cases_property_case_key").on(table.propertyId, table.caseKey)],
);

export const factHouses = sqliteTable(
	"fact_houses",
	{
		factId: text("factId")
			.notNull()
			.references(() => facts.id),
		houseId: text("houseId")
			.notNull()
			.references(() => houses.id),
	},
	(table) => [primaryKey({ columns: [table.factId, table.houseId] })],
);

export const factApartments = sqliteTable(
	"fact_apartments",
	{
		factId: text("factId")
			.notNull()
			.references(() => facts.id),
		apartmentId: text("apartmentId")
			.notNull()
			.references(() => apartments.id),
	},
	(table) => [primaryKey({ columns: [table.factId, table.apartmentId] })],
);

export const factCases = sqliteTable(
	"fact_cases",
	{
		factId: text("factId")
			.notNull()
			.references(() => facts.id),
		caseId: text("caseId")
			.notNull()
			.references(() => cases.id),
	},
	(table) => [primaryKey({ columns: [table.factId, table.caseId] })],
);
