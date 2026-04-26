import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { formatMediumDateTime } from "#/lib/formatTimestamp";

export type DemoSnapshotTrace = {
  id: string;
  caseId: string;
  decision: string;
  reason: string;
  createdAt: string;
};

export type DemoSnapshotData = {
  casesTotal: number;
  casesOpen: number;
  casesResolved: number;
  factsTotal: number;
  historyDaysProcessed?: number;
  latestTraces: DemoSnapshotTrace[];
};

type DemoSnapshotPanelProps = {
  data: DemoSnapshotData;
};

export function DemoSnapshotPanel({ data }: DemoSnapshotPanelProps) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Cases Total" value={data.casesTotal} />
        <MetricCard title="Cases Open" value={data.casesOpen} />
        <MetricCard title="Cases Resolved" value={data.casesResolved} />
        <MetricCard title="Facts Total" value={data.factsTotal} />
        <MetricCard
          title="History Replay Days"
          value={data.historyDaysProcessed ?? "n/a"}
          description="From latest judge summary artifact"
        />
      </div>

      <Card className="py-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base">Latest Guardrail Traces</CardTitle>
          <CardDescription>Most recent closure decisions (approved/rejected).</CardDescription>
        </CardHeader>
        <CardContent className="py-4">
          {data.latestTraces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No guardrail traces available yet.</p>
          ) : (
            <div className="space-y-3">
              {data.latestTraces.map((trace) => (
                <div
                  key={trace.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{trace.caseId}</p>
                    <p className="text-xs text-muted-foreground">{trace.reason}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={trace.decision === "approved" ? "default" : "secondary"}>
                      {trace.decision}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatMediumDateTime(trace.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
}: {
  title: string;
  value: number | string;
  description?: string;
}) {
  return (
    <Card className="py-0">
      <CardHeader className="pb-2 pt-4">
        <CardDescription>{title}</CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
      {description ? (
        <CardContent className="pb-4 pt-0">
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}
