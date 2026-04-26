import { Link } from "@tanstack/react-router";

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
import { formatMediumDateTime } from "#/lib/formatTimestamp";
import type { CaseListItem } from "#/services/cases";

type CasesTableProps = {
	cases: CaseListItem[];
};

function CaseTitleLink({ caseItem }: { caseItem: CaseListItem }) {
	return (
		<Link
			to="/cases/$caseId"
			params={{ caseId: caseItem.id }}
			className="break-words font-semibold leading-snug underline-offset-4 hover:underline"
		>
			{caseItem.title}
		</Link>
	);
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
			<div className="divide-y md:hidden">
				{cases.map((caseItem) => (
					<div key={caseItem.id} className="space-y-4 p-4">
						<div className="space-y-2">
							<CaseTitleLink caseItem={caseItem} />
							<p className="break-all text-xs text-muted-foreground">{caseItem.id}</p>
							<StatusBadge
								status={caseItem.status}
								className="box-border !h-auto max-w-full min-w-0 break-words !shrink flex-wrap !whitespace-normal py-1.5 text-left text-[10px] leading-snug tracking-wide"
							/>
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="space-y-1 break-words">
								<p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
									Property
								</p>
								<p className="font-medium leading-snug">{caseItem.property.name}</p>
								<p className="break-all text-xs text-muted-foreground">
									{caseItem.property.id}
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
									Scope
								</p>
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
							</div>
							<div className="space-y-1 break-words">
								<p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
									Owner
								</p>
								<p className="font-medium leading-snug">{caseItem.owner.name}</p>
								{caseItem.owner.email ? (
									<p className="break-all text-xs text-muted-foreground">
										{caseItem.owner.email}
									</p>
								) : null}
							</div>
							<div className="space-y-2 text-sm text-muted-foreground">
								<div>
									<p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
										Created
									</p>
									<p className="leading-tight">
										{formatMediumDateTime(caseItem.createdAt)}
									</p>
								</div>
								<div>
									<p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
										Updated
									</p>
									<p className="leading-tight">
										{formatMediumDateTime(caseItem.updatedAt)}
									</p>
								</div>
							</div>
						</div>
					</div>
				))}
			</div>
			<Table className="hidden table-fixed md:table">
				<TableHeader>
					<TableRow>
						<TableHead className="min-w-0 w-[26%] whitespace-normal">Case</TableHead>
						<TableHead className="w-[12%] whitespace-normal">Status</TableHead>
						<TableHead className="w-[18%] whitespace-normal">Property</TableHead>
						<TableHead className="w-[16%] whitespace-normal">Scope</TableHead>
						<TableHead className="w-[16%] whitespace-normal">Owner</TableHead>
						<TableHead className="w-[12%] whitespace-normal">
							Created / updated
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{cases.map((caseItem) => (
						<TableRow key={caseItem.id}>
							<TableCell className="min-w-0 align-top whitespace-normal">
								<div className="space-y-1 break-words">
									<CaseTitleLink caseItem={caseItem} />
									<p className="break-all text-xs text-muted-foreground">
										{caseItem.id}
									</p>
								</div>
							</TableCell>
							<TableCell className="min-w-0 align-top whitespace-normal">
								<StatusBadge
									status={caseItem.status}
									className="box-border !h-auto max-w-full min-w-0 break-words !shrink flex-wrap !whitespace-normal py-1.5 text-left text-[10px] leading-snug tracking-wide"
								/>
							</TableCell>
							<TableCell className="min-w-0 align-top whitespace-normal">
								<div className="space-y-1 break-words">
									<p className="font-medium leading-snug">{caseItem.property.name}</p>
									<p className="break-all text-xs text-muted-foreground">
										{caseItem.property.id}
									</p>
								</div>
							</TableCell>
							<TableCell className="min-w-0 align-top whitespace-normal">
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
							<TableCell className="min-w-0 align-top whitespace-normal">
								<div className="space-y-1 break-words">
									<p className="font-medium leading-snug">{caseItem.owner.name}</p>
									{caseItem.owner.email ? (
										<p className="break-all text-xs text-muted-foreground">
											{caseItem.owner.email}
										</p>
									) : null}
								</div>
							</TableCell>
							<TableCell className="min-w-0 align-top whitespace-normal text-sm text-muted-foreground">
								<div className="space-y-2">
									<div>
										<p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
											Created
										</p>
										<p className="leading-tight">
											{formatMediumDateTime(caseItem.createdAt)}
										</p>
									</div>
									<div>
										<p className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
											Updated
										</p>
										<p className="leading-tight">
											{formatMediumDateTime(caseItem.updatedAt)}
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
