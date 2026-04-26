import { desc, eq } from "drizzle-orm";

import { type AppDatabase, db } from "#/services/database";
import { listAgentRunsForCase, type AgentRecommendation } from "#/services/agentRuns";
import * as schema from "#/db/schema";

export type CaseDetail = Awaited<ReturnType<typeof getCaseDetail>>;

function parseJson<T>(value: string | null): T | null {
	if (!value) {
		return null;
	}
	return JSON.parse(value) as T;
}

export async function getCaseDetail(
	database: AppDatabase = db,
	caseId: string,
) {
	const caseRow = await database.query.cases.findFirst({
		where: (cases, { eq: equals }) => equals(cases.id, caseId),
		with: {
			apartment: true,
			house: true,
			owner: true,
			property: true,
		},
	});

	if (!caseRow) {
		throw new Error(`Case not found: ${caseId}`);
	}

	const factLinks = await database.query.factCases.findMany({
		where: (factCases, { eq: equals }) => equals(factCases.caseId, caseId),
		with: {
			fact: {
				with: {
					source: true,
				},
			},
		},
	});

	const guardrailTraces = await database.query.caseActionTraces.findMany({
		where: (caseActionTraces, { eq: equals }) =>
			equals(caseActionTraces.caseId, caseId),
		orderBy: (caseActionTraces) => [desc(caseActionTraces.createdAt)],
	});

	const agentRuns = await listAgentRunsForCase(database, caseId);

	return {
		case: caseRow,
		evidence: factLinks.map((link) => ({
			...link.fact,
			source: link.fact.source,
		})),
		guardrailTraces: guardrailTraces.map((trace) => ({
			...trace,
			evidenceFactIds: parseJson<string[]>(trace.evidenceFactIds) ?? [],
		})),
		agentRuns: agentRuns.map((run) => ({
			...run,
			finalRecommendation:
				parseJson<AgentRecommendation>(run.finalRecommendationJson) ?? null,
			messages: run.messages,
			toolCalls: run.toolCalls.map((toolCall) => ({
				...toolCall,
				arguments: parseJson<unknown>(toolCall.argumentsJson),
				result: parseJson<unknown>(toolCall.resultJson),
			})),
		})),
	};
}

export async function getGuardrailTraceById(
	database: AppDatabase = db,
	traceId: string,
) {
	return database.query.caseActionTraces.findFirst({
		where: eq(schema.caseActionTraces.id, traceId),
	});
}
