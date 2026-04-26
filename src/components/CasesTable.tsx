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
			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Case</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Property</TableHead>
							<TableHead>Scope</TableHead>
							<TableHead>Owner</TableHead>
							<TableHead>Updated</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{cases.map((caseItem) => (
							<TableRow key={caseItem.id}>
								<TableCell className="min-w-56 align-top">
									<div className="space-y-1">
										<p className="font-semibold">{caseItem.title}</p>
										<p className="text-xs text-muted-foreground">{caseItem.id}</p>
										<p className="text-sm text-muted-foreground">{caseItem.summary}</p>
									</div>
								</TableCell>
								<TableCell className="align-top">
									<StatusBadge status={caseItem.status} />
								</TableCell>
								<TableCell className="min-w-44 align-top">
									<div className="space-y-1">
										<p className="font-medium">{caseItem.property.name}</p>
										<p className="text-xs text-muted-foreground">{caseItem.property.id}</p>
									</div>
								</TableCell>
								<TableCell className="min-w-48 align-top">
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
								<TableCell className="min-w-40 align-top">
									<div className="space-y-1">
										<p className="font-medium">{caseItem.owner.name}</p>
										{caseItem.owner.email ? (
											<p className="text-xs text-muted-foreground">{caseItem.owner.email}</p>
										) : null}
									</div>
								</TableCell>
								<TableCell className="min-w-36 align-top text-sm text-muted-foreground">
									{new Date(caseItem.updatedAt).toLocaleString("en-GB", {
										dateStyle: "medium",
										timeStyle: "short",
									})}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
