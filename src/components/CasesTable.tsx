import { StatusBadge } from "#/components/StatusBadge";
import { Badge } from "#/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import type { CaseListItem } from "#/services/cases";

type CasesTableProps = {
	cases: CaseListItem[];
};

function formatCaseTimestamp(iso: string): string {
	return new Date(iso).toLocaleString("en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
	});
}

export function CasesTable({ cases }: CasesTableProps) {
	if (cases.length === 0) {
		return (
			<div className="rounded-lg border border-dashed bg-card px-6 py-6 text-sm text-muted-foreground">
				No cases found.
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-lg border bg-card">
			<Table className="table-fixed">
				<TableHeader>
					<TableRow>
						<TableHead className="min-w-0 w-[35%] whitespace-normal">
							Case
						</TableHead>
						<TableHead className="w-[13%] whitespace-normal">Status</TableHead>
						<TableHead className="w-[16%] whitespace-normal">Property</TableHead>
						<TableHead className="w-[12%] whitespace-normal">Scope</TableHead>
						<TableHead className="w-[14%] whitespace-normal">Owner</TableHead>
						<TableHead className="w-[10%] whitespace-normal">
							Created / updated
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{cases.map((caseItem) => (
						<TableRow key={caseItem.id}>
							<TableCell className="min-w-0 align-top whitespace-normal">
								<div className="space-y-1 break-words">
									<p className="font-semibold leading-snug">{caseItem.title}</p>
									<p className="text-xs text-muted-foreground">{caseItem.id}</p>
									<p className="text-sm leading-snug text-muted-foreground">
										{caseItem.summary}
									</p>
								</div>
							</TableCell>
							<TableCell className="min-w-0 align-top whitespace-normal">
								<StatusBadge
									status={caseItem.status}
									className="box-border !h-auto max-w-full min-w-0 break-words !shrink flex-wrap !whitespace-normal py-1.5 text-left text-[10px] leading-snug tracking-wide"
								/>
							</TableCell>
							<TableCell className="align-top whitespace-normal">
								<div className="space-y-1 break-words">
									<p className="font-medium leading-snug">{caseItem.property.name}</p>
									<p className="text-xs text-muted-foreground">{caseItem.property.id}</p>
								</div>
							</TableCell>
							<TableCell className="align-top whitespace-normal">
								<div className="flex flex-wrap gap-1.5">
									{caseItem.house ? (
										<Badge variant="secondary">{caseItem.house.id}</Badge>
									) : null}
									{caseItem.apartment ? (
										<Badge>{caseItem.apartment.id}</Badge>
									) : null}
									{!caseItem.house && !caseItem.apartment ? (
										<span className="text-sm text-muted-foreground">Property only</span>
									) : null}
								</div>
							</TableCell>
							<TableCell className="align-top whitespace-normal">
								<div className="space-y-1 break-words">
									<p className="font-medium leading-snug">{caseItem.owner.name}</p>
									{caseItem.owner.email ? (
										<p className="text-xs text-muted-foreground">{caseItem.owner.email}</p>
									) : null}
								</div>
							</TableCell>
							<TableCell className="align-top whitespace-normal text-sm text-muted-foreground">
								<div className="space-y-2">
									<div>
										<p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
											Created
										</p>
										<p className="leading-tight">
											{formatCaseTimestamp(caseItem.createdAt)}
										</p>
									</div>
									<div>
										<p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
											Updated
										</p>
										<p className="leading-tight">
											{formatCaseTimestamp(caseItem.updatedAt)}
										</p>
									</div>
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
