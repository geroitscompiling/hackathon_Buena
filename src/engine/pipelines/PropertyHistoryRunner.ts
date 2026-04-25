import { promises as fs } from "node:fs";
import path from "node:path";

import type { BaselineDryRunSummary } from "./BaselineDryRunPipeline";

export interface DayDirectory {
  dayLabel: string;
  absolutePath: string;
}

export interface RunDayInput {
  dayLabel: string;
  datasetRootPath: string;
  noisyInputFiles: string[];
}

export interface PropertyHistoryReplaySummary {
  totalDaysProcessed: number;
  days: Array<{
    dayLabel: string;
    summary: BaselineDryRunSummary;
  }>;
  totals: Pick<
    BaselineDryRunSummary,
    | "factsInserted"
    | "factsBlockedAsConflicts"
    | "factsUpdatedIdempotent"
    | "factsPersisted"
    | "noisySourcesEvaluated"
    | "noisySourcesWithFacts"
  >;
}

export async function collectDayDirectories(
  dayRootPath: string,
): Promise<DayDirectory[]> {
  const entries = await fs.readdir(dayRootPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && /^day-\d+$/i.test(entry.name))
    .map((entry) => ({
      dayLabel: entry.name,
      absolutePath: path.join(dayRootPath, entry.name),
    }))
    .sort((left, right) => parseDayIndex(left.dayLabel) - parseDayIndex(right.dayLabel));
}

export async function collectNoisyFilesForDay(
  dayPath: string,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (entry.name.endsWith(".eml") || entry.name.endsWith(".pdf")) {
        results.push(path.relative(dayPath, absolutePath));
      }
    }
  }

  await walk(dayPath);
  return results.sort();
}

export async function runPropertyHistoryReplay({
  dayRootPath,
  runDay,
}: {
  dayRootPath: string;
  runDay: (input: RunDayInput) => Promise<BaselineDryRunSummary>;
}): Promise<PropertyHistoryReplaySummary> {
  const dayDirectories = await collectDayDirectories(dayRootPath);
  const replayDays: PropertyHistoryReplaySummary["days"] = [];
  const totals: PropertyHistoryReplaySummary["totals"] = {
    factsInserted: 0,
    factsBlockedAsConflicts: 0,
    factsUpdatedIdempotent: 0,
    factsPersisted: 0,
    noisySourcesEvaluated: 0,
    noisySourcesWithFacts: 0,
  };

  for (const dayDirectory of dayDirectories) {
    const noisyInputFiles = await collectNoisyFilesForDay(dayDirectory.absolutePath);
    const summary = await runDay({
      dayLabel: dayDirectory.dayLabel,
      datasetRootPath: dayDirectory.absolutePath,
      noisyInputFiles,
    });
    replayDays.push({
      dayLabel: dayDirectory.dayLabel,
      summary,
    });
    totals.factsInserted += summary.factsInserted;
    totals.factsBlockedAsConflicts += summary.factsBlockedAsConflicts;
    totals.factsUpdatedIdempotent += summary.factsUpdatedIdempotent;
    totals.factsPersisted += summary.factsPersisted;
    totals.noisySourcesEvaluated += summary.noisySourcesEvaluated;
    totals.noisySourcesWithFacts += summary.noisySourcesWithFacts;
  }

  return {
    totalDaysProcessed: replayDays.length,
    days: replayDays,
    totals,
  };
}

function parseDayIndex(dayLabel: string): number {
  const match = dayLabel.match(/day-(\d+)/i);
  return match?.[1] ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}
