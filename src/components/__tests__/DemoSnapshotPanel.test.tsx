// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DemoSnapshotPanel } from "#/components/DemoSnapshotPanel";

describe("DemoSnapshotPanel", () => {
  it("renders headline metrics and latest traces", () => {
    render(
      <DemoSnapshotPanel
        data={{
          casesTotal: 12,
          casesOpen: 4,
          casesResolved: 8,
          factsTotal: 77,
          historyDaysProcessed: 10,
          latestTraces: [
            {
              id: "trace-1",
              caseId: "case-1",
              decision: "approved",
              reason: "closed_with_guardrails",
              createdAt: "2026-04-26T10:00:00.000Z",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Cases Total")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("History Replay Days")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("Latest Guardrail Traces")).toBeTruthy();
    expect(screen.getByText("case-1")).toBeTruthy();
    expect(screen.getByText("approved")).toBeTruthy();
  });
});
