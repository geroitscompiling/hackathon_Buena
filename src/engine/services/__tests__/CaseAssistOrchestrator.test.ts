import { describe, expect, it } from "vitest";

import { createPostgresTestDb } from "#/test/postgresTestDb";
import * as schema from "#/db/schema";
import { CaseLifecycleService } from "../CaseLifecycleService";
import { CaseAssistOrchestrator } from "../CaseAssistOrchestrator";

function vectorOf(a: number, b = 0): number[] {
	return [a, b, ...Array.from({ length: 1534 }, () => 0)];
}

describe("CaseAssistOrchestrator (E4.4)", () => {
	it("builds MCP-based recommendation bundle and uses guardrails for close action", async () => {
		const testDb = await createPostgresTestDb();
		const db = testDb.db;
		try {
			await db.insert(schema.properties).values({
				id: "LIE-001",
				name: "Property",
			});
			await db.insert(schema.houses).values({
				id: "LIE-001-H1",
				propertyId: "LIE-001",
				name: "H1",
			});
			await db.insert(schema.apartments).values({
				id: "LIE-001-H1-A1",
				houseId: "LIE-001-H1",
				name: "Unit 1",
			});
			await db.insert(schema.users).values({
				id: "user-1",
				name: "Owner",
				email: "owner@test",
			});
			await db.insert(schema.sources).values({
				id: "src-1",
				fileId: "f.eml",
				fileType: "eml",
				ingestionDate: "2026-04-26T10:00:00.000Z",
			});
			await db.insert(schema.cases).values({
				id: "case-1",
				propertyId: "LIE-001",
				houseId: "LIE-001-H1",
				apartmentId: "LIE-001-H1-A1",
				ownerUserId: "user-1",
				caseKey: "a:LIE-001-H1-A1|window|repair",
				closurePredicate: "invoice_paid",
				title: "Window repair follow-up",
				summary: "Waiting for invoice confirmation",
				status: "open",
				createdAt: "2026-04-26T10:00:00.000Z",
				updatedAt: "2026-04-26T10:00:00.000Z",
				embedding: vectorOf(1),
			});
			await db.insert(schema.facts).values({
				id: "fact-1",
				propertyId: "LIE-001",
				category: "financial",
				key: "invoice_paid",
				value: "paid",
				sourceId: "src-1",
				isGoldStandard: false,
				confidenceScore: 0.95,
				embedding: vectorOf(1),
			});
			await db.insert(schema.factHouses).values({ factId: "fact-1", houseId: "LIE-001-H1" });
			await db.insert(schema.factApartments).values({ factId: "fact-1", apartmentId: "LIE-001-H1-A1" });

			const orchestrator = new CaseAssistOrchestrator(db, new CaseLifecycleService(db), {
				embeddingClient: {
					embedDocument: async () => vectorOf(1),
					embedQuery: async () => vectorOf(1),
				},
			});
			const result = await orchestrator.run({
				caseId: "case-1",
				propertyId: "LIE-001",
				confidenceThreshold: 0.8,
				nowIso: "2026-04-26T11:00:00.000Z",
			});

			expect(result.bundle.case.id).toBe("case-1");
			expect(result.recommendation.proposedAction).toBe("close_case");
			expect(result.guardrailResult?.closed).toBe(true);
		} finally {
			await testDb.close();
		}
	});
});
