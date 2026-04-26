CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"caseId" text NOT NULL REFERENCES "cases"("id"),
	"model" text NOT NULL,
	"status" text NOT NULL,
	"finalRecommendationJson" text,
	"guardrailTraceId" text REFERENCES "case_action_traces"("id"),
	"startedAt" text NOT NULL,
	"finishedAt" text,
	"createdAt" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "agent_run_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"agentRunId" text NOT NULL REFERENCES "agent_runs"("id"),
	"stepIndex" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"createdAt" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "agent_run_tool_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"agentRunId" text NOT NULL REFERENCES "agent_runs"("id"),
	"stepIndex" integer NOT NULL,
	"toolName" text NOT NULL,
	"argumentsJson" text NOT NULL,
	"resultJson" text,
	"status" text NOT NULL,
	"error" text,
	"startedAt" text NOT NULL,
	"finishedAt" text,
	"createdAt" text NOT NULL
);
