import { asc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { type AppDatabase, db } from "#/services/database";
import * as schema from "#/db/schema";

export type AgentRecommendation = {
	proposedAction: "close_case" | "keep_open";
	confidence: number;
	summary: string;
	evidenceFactIds: string[];
};

export type AgentRunStatus = "running" | "completed" | "failed";
export type AgentMessageRole = "system" | "user" | "assistant" | "tool";
export type AgentToolCallStatus = "completed" | "failed";

export async function createAgentRun(
	database: AppDatabase = db,
	input: {
		caseId: string;
		model: string;
		startedAt: string;
	},
) {
	const run = {
		id: randomUUID(),
		caseId: input.caseId,
		model: input.model,
		status: "running" as const,
		finalRecommendationJson: null,
		guardrailTraceId: null,
		startedAt: input.startedAt,
		finishedAt: null,
		createdAt: input.startedAt,
	};

	await database.insert(schema.agentRuns).values(run);
	return run;
}

export async function appendAgentRunMessage(
	database: AppDatabase = db,
	input: {
		agentRunId: string;
		stepIndex: number;
		role: AgentMessageRole;
		content: string;
		createdAt: string;
	},
) {
	await database.insert(schema.agentRunMessages).values({
		id: randomUUID(),
		agentRunId: input.agentRunId,
		stepIndex: input.stepIndex,
		role: input.role,
		content: input.content,
		createdAt: input.createdAt,
	});
}

export async function appendAgentRunToolCall(
	database: AppDatabase = db,
	input: {
		agentRunId: string;
		stepIndex: number;
		toolName: string;
		arguments: unknown;
		result?: unknown;
		status: AgentToolCallStatus;
		error?: string;
		startedAt: string;
		finishedAt?: string;
		createdAt: string;
	},
) {
	await database.insert(schema.agentRunToolCalls).values({
		id: randomUUID(),
		agentRunId: input.agentRunId,
		stepIndex: input.stepIndex,
		toolName: input.toolName,
		argumentsJson: JSON.stringify(input.arguments),
		resultJson:
			typeof input.result === "undefined" ? null : JSON.stringify(input.result),
		status: input.status,
		error: input.error ?? null,
		startedAt: input.startedAt,
		finishedAt: input.finishedAt ?? null,
		createdAt: input.createdAt,
	});
}

export async function completeAgentRun(
	database: AppDatabase = db,
	input: {
		agentRunId: string;
		status: Exclude<AgentRunStatus, "running">;
		finalRecommendation?: AgentRecommendation;
		guardrailTraceId?: string;
		finishedAt: string;
	},
) {
	await database
		.update(schema.agentRuns)
		.set({
			status: input.status,
			finalRecommendationJson: input.finalRecommendation
				? JSON.stringify(input.finalRecommendation)
				: null,
			guardrailTraceId: input.guardrailTraceId ?? null,
			finishedAt: input.finishedAt,
		})
		.where(eq(schema.agentRuns.id, input.agentRunId));
}

export async function listAgentRunsForCase(
	database: AppDatabase = db,
	caseId: string,
) {
	return database.query.agentRuns.findMany({
		where: (agentRuns, { eq: equals }) => equals(agentRuns.caseId, caseId),
		orderBy: (agentRuns) => [asc(agentRuns.startedAt)],
		with: {
			guardrailTrace: true,
			messages: {
				orderBy: (agentRunMessages) => [asc(agentRunMessages.stepIndex)],
			},
			toolCalls: {
				orderBy: (agentRunToolCalls) => [asc(agentRunToolCalls.stepIndex)],
			},
		},
	});
}
