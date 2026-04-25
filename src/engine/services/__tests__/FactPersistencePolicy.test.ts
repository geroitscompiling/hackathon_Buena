import { describe, expect, it } from "vitest";

import { FactPersistencePolicy } from "../FactPersistencePolicy";

type FactScope = {
	scopeType: "property" | "house" | "apartment";
	propertyId: string;
	houseId?: string;
	apartmentId?: string;
};

type PersistedFactRecord = {
	id: string;
	scope: FactScope;
	category: string;
	key: string;
	value: string;
	sourceId: string;
	isGoldStandard: boolean;
};

type IncomingFact = {
	scope: FactScope;
	category: string;
	key: string;
	value: string;
	sourceId: string;
	isGoldStandard: boolean;
};

describe("FactPersistencePolicy", () => {
	it("blocks effective overwrite when AI fact matches gold semantic identity in the same scope", async () => {
		const policy = new FactPersistencePolicy();
		const existingFacts: PersistedFactRecord[] = [
			{
				id: "fact-gold-1",
				scope: {
					scopeType: "house",
					propertyId: "LIE-001",
					houseId: "LIE-001-H1",
				},
				category: "maintenance",
				key: "boiler_status",
				value: "inspection_due",
				sourceId: "stammdaten.json",
				isGoldStandard: true,
			},
		];
		const incomingFact: IncomingFact = {
			scope: {
				scopeType: "house",
				propertyId: "LIE-001",
				houseId: "LIE-001-H1",
			},
			category: "maintenance",
			key: "boiler_status",
			value: "broken_now",
			sourceId: "EMAIL-0012.eml",
			isGoldStandard: false,
		};

		await expect(
			policy.evaluate({
				existingFacts,
				incomingFact,
			}),
		).resolves.toMatchObject({
			outcome: "blocked_as_conflict",
			reason: "existing_gold_fact_same_semantic_identity",
		});
	});

	it("allows same key when scope differs", async () => {
		const policy = new FactPersistencePolicy();
		const existingFacts: PersistedFactRecord[] = [
			{
				id: "fact-gold-property-1",
				scope: {
					scopeType: "property",
					propertyId: "LIE-001",
				},
				category: "financial",
				key: "insurance_provider",
				value: "Acme Insurance",
				sourceId: "stammdaten.json",
				isGoldStandard: true,
			},
		];
		const incomingFact: IncomingFact = {
			scope: {
				scopeType: "apartment",
				propertyId: "LIE-001",
				houseId: "LIE-001-H1",
				apartmentId: "LIE-001-H1-A2",
			},
			category: "financial",
			key: "insurance_provider",
			value: "Tenant addon provider",
			sourceId: "EMAIL-0033.eml",
			isGoldStandard: false,
		};

		await expect(
			policy.evaluate({
				existingFacts,
				incomingFact,
			}),
		).resolves.toMatchObject({
			outcome: "inserted",
		});
	});

	it("allows ERP-origin gold updates on same semantic identity as idempotent update path", async () => {
		const policy = new FactPersistencePolicy();
		const existingFacts: PersistedFactRecord[] = [
			{
				id: "fact-gold-erp-1",
				scope: {
					scopeType: "property",
					propertyId: "LIE-001",
				},
				category: "core_erp",
				key: "unit_count",
				value: "12",
				sourceId: "stammdaten.json",
				isGoldStandard: true,
			},
		];
		const incomingFact: IncomingFact = {
			scope: {
				scopeType: "property",
				propertyId: "LIE-001",
			},
			category: "core_erp",
			key: "unit_count",
			value: "12",
			sourceId: "stammdaten.json",
			isGoldStandard: true,
		};

		await expect(
			policy.evaluate({
				existingFacts,
				incomingFact,
			}),
		).resolves.toMatchObject({
			outcome: "updated_idempotent",
		});
	});

	it("dedupes duplicate AI reruns instead of creating semantic duplicates", async () => {
		const policy = new FactPersistencePolicy();
		const existingFacts: PersistedFactRecord[] = [
			{
				id: "fact-ai-1",
				scope: {
					scopeType: "apartment",
					propertyId: "LIE-001",
					houseId: "LIE-001-H1",
					apartmentId: "LIE-001-H1-A1",
				},
				category: "maintenance",
				key: "window_leak",
				value: "reported",
				sourceId: "EMAIL-0021.eml",
				isGoldStandard: false,
			},
		];
		const incomingFact: IncomingFact = {
			scope: {
				scopeType: "apartment",
				propertyId: "LIE-001",
				houseId: "LIE-001-H1",
				apartmentId: "LIE-001-H1-A1",
			},
			category: "maintenance",
			key: "window_leak",
			value: "reported",
			sourceId: "EMAIL-0021.eml",
			isGoldStandard: false,
		};

		await expect(
			policy.evaluate({
				existingFacts,
				incomingFact,
			}),
		).resolves.toMatchObject({
			outcome: "updated_idempotent",
		});
	});
});
