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
    | "casesOpened"
    | "casesUpdated"
    | "casesResolved"
    | "factCaseLinksCreated"
    | "assistRuns"
    | "assistProposedClose"
    | "assistGuardedClosed"
    | "assistGuardedRejected"
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
  dayFilter,
  runDay,
}: {
  dayRootPath: string;
  dayFilter?: string;
  runDay: (input: RunDayInput) => Promise<BaselineDryRunSummary>;
}): Promise<PropertyHistoryReplaySummary> {
  const dayDirectories = await collectDayDirectories(dayRootPath);
  const normalizedDayFilter = normalizeDayFilter(dayFilter);
  const selectedDayDirectories = normalizedDayFilter
    ? dayDirectories.filter((dayDirectory) => dayDirectory.dayLabel === normalizedDayFilter)
    : dayDirectories;

  if (normalizedDayFilter && selectedDayDirectories.length === 0) {
    throw new Error(
      `Requested history day "${dayFilter}" was not found under ${dayRootPath}.`,
    );
  }
  const replayDays: PropertyHistoryReplaySummary["days"] = [];
  const totals: PropertyHistoryReplaySummary["totals"] = {
    factsInserted: 0,
    factsBlockedAsConflicts: 0,
    factsUpdatedIdempotent: 0,
    factsPersisted: 0,
    noisySourcesEvaluated: 0,
    noisySourcesWithFacts: 0,
    casesOpened: 0,
    casesUpdated: 0,
    casesResolved: 0,
    factCaseLinksCreated: 0,
    assistRuns: 0,
    assistProposedClose: 0,
    assistGuardedClosed: 0,
    assistGuardedRejected: 0,
  };

  for (const dayDirectory of selectedDayDirectories) {
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
    totals.casesOpened += summary.casesOpened;
    totals.casesUpdated += summary.casesUpdated;
    totals.casesResolved += summary.casesResolved;
    totals.factCaseLinksCreated += summary.factCaseLinksCreated;
    totals.assistRuns += summary.assistRuns;
    totals.assistProposedClose += summary.assistProposedClose;
    totals.assistGuardedClosed += summary.assistGuardedClosed;
    totals.assistGuardedRejected += summary.assistGuardedRejected;
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

function normalizeDayFilter(dayFilter?: string): string | undefined {
  if (!dayFilter) {
    return undefined;
  }

  const trimmedDayFilter = dayFilter.trim();
  if (!trimmedDayFilter) {
    return undefined;
  }

  const match = trimmedDayFilter.match(/^(?:day-)?(\d+)$/i);
  if (!match?.[1]) {
    return trimmedDayFilter;
  }

  return `day-${match[1].padStart(2, "0")}`;
}
