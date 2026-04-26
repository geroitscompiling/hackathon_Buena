import { index } from "drizzle-orm/pg-core";
import {
	boolean,
	pgTable,
	primaryKey,
	real,
	text,
	uniqueIndex,
	vector,
} from "drizzle-orm/pg-core";

const embeddingDimensions = 1536;

export const properties = pgTable("properties", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
});

export const houses = pgTable("houses", {
	id: text("id").primaryKey(),
	propertyId: text("propertyId")
		.notNull()
		.references(() => properties.id),
	name: text("name").notNull(),
});

export const apartments = pgTable("apartments", {
	id: text("id").primaryKey(),
	houseId: text("houseId")
		.notNull()
		.references(() => houses.id),
	name: text("name").notNull(),
});

export const users = pgTable("users", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email"),
});

export const sources = pgTable("sources", {
	id: text("id").primaryKey(),
	fileId: text("fileId").notNull(),
	fileType: text("fileType").notNull(),
	ingestionDate: text("ingestionDate").notNull(),
	documentDate: text("documentDate"),
	anchorReference: text("anchorReference"),
});

export const facts = pgTable(
	"facts",
	{
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
		isGoldStandard: boolean("isGoldStandard").notNull(),
		confidenceScore: real("confidenceScore").notNull(),
		embedding: vector("embedding", { dimensions: embeddingDimensions }),
	},
	(table) => [
		index("facts_embedding_hnsw").using(
			"hnsw",
			table.embedding.op("vector_cosine_ops"),
		),
	],
);

export const cases = pgTable(
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
		embedding: vector("embedding", { dimensions: embeddingDimensions }),
	},
	(table) => [
		uniqueIndex("cases_property_case_key").on(table.propertyId, table.caseKey),
		index("cases_embedding_hnsw").using(
			"hnsw",
			table.embedding.op("vector_cosine_ops"),
		),
	],
);

export const factHouses = pgTable(
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

export const factApartments = pgTable(
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

export const factCases = pgTable(
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

export const caseActionTraces = pgTable("case_action_traces", {
	id: text("id").primaryKey(),
	caseId: text("caseId")
		.notNull()
		.references(() => cases.id),
	action: text("action").notNull(),
	decision: text("decision").notNull(),
	reason: text("reason").notNull(),
	confidenceScore: real("confidenceScore").notNull(),
	confidenceThreshold: real("confidenceThreshold").notNull(),
	evidenceFactIds: text("evidenceFactIds").notNull(),
	contextSummary: text("contextSummary").notNull(),
	createdAt: text("createdAt").notNull(),
});
