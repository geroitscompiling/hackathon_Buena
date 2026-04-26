CREATE TABLE IF NOT EXISTS "case_action_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"caseId" text NOT NULL REFERENCES "cases"("id"),
	"action" text NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"confidenceScore" real NOT NULL,
	"confidenceThreshold" real NOT NULL,
	"evidenceFactIds" text NOT NULL,
	"contextSummary" text NOT NULL,
	"createdAt" text NOT NULL
);
