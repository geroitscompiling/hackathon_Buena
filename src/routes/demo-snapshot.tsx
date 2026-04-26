import { promises as fs } from "node:fs";
import path from "node:path";
import { desc, eq, ne, sql } from "drizzle-orm";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { db } from "#/db";
import { caseActionTraces, cases, facts } from "#/db/schema";
import { DemoSnapshotPanel, type DemoSnapshotData } from "#/components/DemoSnapshotPanel";

const getDemoSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const [{ count: casesTotal }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cases);
  const [{ count: casesOpen }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cases)
    .where(ne(cases.status, "resolved"));
  const [{ count: casesResolved }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cases)
    .where(eq(cases.status, "resolved"));
  const [{ count: factsTotal }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(facts);

  const latestTraces = await db.query.caseActionTraces.findMany({
    orderBy: [desc(caseActionTraces.createdAt)],
    limit: 8,
  });

  const historyDaysProcessed = await readHistoryDaysFromSummary();

  return {
    casesTotal: Number(casesTotal ?? 0),
    casesOpen: Number(casesOpen ?? 0),
    casesResolved: Number(casesResolved ?? 0),
    factsTotal: Number(factsTotal ?? 0),
    historyDaysProcessed,
    latestTraces: latestTraces.map((trace) => ({
      id: trace.id,
      caseId: trace.caseId,
      decision: trace.decision,
      reason: trace.reason,
      createdAt: trace.createdAt,
    })),
  } satisfies DemoSnapshotData;
});

export const Route = createFileRoute("/demo-snapshot")({
  loader: async () => await getDemoSnapshot(),
  component: DemoSnapshotPage,
});

function DemoSnapshotPage() {
  const data = Route.useLoaderData();
  return (
    <main className="px-4 py-6 md:px-6">
      <section className="mb-6">
        <p className="mb-2 text-sm text-muted-foreground">Demo Snapshot</p>
        <h1 className="text-2xl font-semibold">Read-only stage overview</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Lightweight operational snapshot for judges: case/fact counters and latest guardrail decisions.
        </p>
      </section>
      <DemoSnapshotPanel data={data} />
    </main>
  );
}

async function readHistoryDaysFromSummary(): Promise<number | undefined> {
  try {
    const summaryPath = path.resolve("artifacts/judge-demo-summary.json");
    const raw = await fs.readFile(summaryPath, "utf8");
    const parsed = JSON.parse(raw) as { historyReplay?: { totalDaysProcessed?: unknown } };
    const value = parsed.historyReplay?.totalDaysProcessed;
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
