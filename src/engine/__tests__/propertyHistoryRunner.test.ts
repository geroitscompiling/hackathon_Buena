import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  collectDayDirectories,
  runPropertyHistoryReplay,
  type RunDayInput,
} from "#/engine/pipelines/PropertyHistoryRunner";

describe("PropertyHistoryRunner", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.map(async (root) => {
        await fs.rm(root, { recursive: true, force: true });
      }),
    );
  });

  it("collects day directories in chronological order", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "history-days-"));
    tempRoots.push(root);
    await fs.mkdir(path.join(root, "day-10"), { recursive: true });
    await fs.mkdir(path.join(root, "day-02"), { recursive: true });
    await fs.mkdir(path.join(root, "day-01"), { recursive: true });

    const result = await collectDayDirectories(root);
    expect(result.map((day: { dayLabel: string }) => day.dayLabel)).toEqual([
      "day-01",
      "day-02",
      "day-10",
    ]);
  });

  it("replays day folders and aggregates per-day summaries", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "history-replay-"));
    tempRoots.push(root);
    const dayOne = path.join(root, "day-01");
    const dayTwo = path.join(root, "day-02");
    await fs.mkdir(path.join(dayOne, "emails"), { recursive: true });
    await fs.mkdir(path.join(dayTwo, "rechnungen"), { recursive: true });
    await fs.writeFile(path.join(dayOne, "emails", "one.eml"), "Subject: Test", "utf8");
    await fs.writeFile(path.join(dayTwo, "rechnungen", "two.pdf"), "Invoice", "utf8");

    const calls: Array<{ datasetRootPath: string; noisyInputFiles: string[] }> = [];
    const replay = await runPropertyHistoryReplay({
      dayRootPath: root,
      runDay: async ({ datasetRootPath, noisyInputFiles }: RunDayInput) => {
        calls.push({ datasetRootPath, noisyInputFiles });
        return {
          sourcesPersisted: noisyInputFiles.length,
          factsInserted: noisyInputFiles.length,
          factsBlockedAsConflicts: 0,
          factsUpdatedIdempotent: 0,
          factsPersisted: noisyInputFiles.length,
          goldFactsPersisted: 0,
          nonGoldFactsPersisted: noisyInputFiles.length,
          noisySourcesEvaluated: noisyInputFiles.length,
          noisySourcesWithFacts: noisyInputFiles.length,
        };
      },
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].datasetRootPath).toBe(dayOne);
    expect(calls[0].noisyInputFiles).toEqual(["emails/one.eml"]);
    expect(calls[1].datasetRootPath).toBe(dayTwo);
    expect(calls[1].noisyInputFiles).toEqual(["rechnungen/two.pdf"]);
    expect(replay.totalDaysProcessed).toBe(2);
    expect(replay.totals.factsInserted).toBe(2);
  });
});
