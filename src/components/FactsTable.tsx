import { Badge } from "#/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import type { FactListItem } from "#/services/facts";

type FactsTableProps = {
	facts: FactListItem[];
};

export function FactsTable({ facts }: FactsTableProps) {
	if (facts.length === 0) {
		return (
			<div className="rounded-[1.75rem] border border-dashed border-border/70 bg-white/60 px-6 py-6 text-sm text-muted-foreground">
				No facts found.
			</div>
		);
	}

	return (
		<div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-white/80">
			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Key</TableHead>
							<TableHead>Value</TableHead>
							<TableHead>Property</TableHead>
							<TableHead>Scope</TableHead>
							<TableHead>Source</TableHead>
							<TableHead>Meta</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{facts.map((fact) => (
							<TableRow key={fact.id}>
								<TableCell className="min-w-36 align-top">
									<div className="space-y-1">
										<p className="font-semibold text-[var(--sea-ink)]">
											{fact.key}
										</p>
										<p className="text-xs text-[var(--sea-ink-soft)]">
											{fact.id}
										</p>
									</div>
								</TableCell>
								<TableCell className="min-w-40 align-top text-[var(--sea-ink)]">
									{fact.value}
								</TableCell>
								<TableCell className="min-w-44 align-top">
									<div className="space-y-1">
										<p className="font-medium text-[var(--sea-ink)]">
											{fact.property.name}
										</p>
										<p className="text-xs text-[var(--sea-ink-soft)]">
											{fact.property.id}
										</p>
									</div>
								</TableCell>
								<TableCell className="min-w-56 align-top">
									<div className="flex flex-wrap gap-1.5">
										{fact.houseIds.map((houseId) => (
											<Badge key={houseId} variant="outline">
												{houseId}
											</Badge>
										))}
										{fact.apartmentIds.map((apartmentId) => (
											<Badge key={apartmentId} variant="secondary">
												{apartmentId}
											</Badge>
										))}
										{fact.caseIds.map((caseId) => (
											<Badge key={caseId}>{caseId}</Badge>
										))}
										{fact.houseIds.length === 0 &&
										fact.apartmentIds.length === 0 &&
										fact.caseIds.length === 0 ? (
											<span className="text-sm text-[var(--sea-ink-soft)]">
												Property only
											</span>
										) : null}
									</div>
								</TableCell>
								<TableCell className="min-w-36 align-top">
									<div className="space-y-1">
										<p className="font-medium text-[var(--sea-ink)]">
											{fact.source.fileId}
										</p>
										<p className="text-xs uppercase tracking-wide text-[var(--sea-ink-soft)]">
											{fact.source.fileType}
										</p>
									</div>
								</TableCell>
								<TableCell className="min-w-36 align-top">
									<div className="flex flex-wrap gap-1.5">
										<Badge variant="outline">{fact.category}</Badge>
										<Badge variant="secondary">
											{Math.round(fact.confidenceScore * 100)}%
										</Badge>
										{fact.isGoldStandard ? <Badge>Gold</Badge> : null}
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
