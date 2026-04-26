import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
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
	onEditFact?: (fact: FactListItem) => void;
};

export function FactsTable({ facts, onEditFact }: FactsTableProps) {
	if (facts.length === 0) {
		return (
			<div className="rounded-lg border border-dashed bg-card px-6 py-6 text-sm text-muted-foreground">
				No facts found.
			</div>
		);
	}

	return (
		<div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border bg-card">
			<Table className="table-fixed">
				<TableHeader>
					<TableRow>
						{onEditFact ? (
							<TableHead className="w-[7%] align-top whitespace-normal">
								Actions
							</TableHead>
						) : null}
						<TableHead
							className={
								onEditFact ?
									"w-[13%] align-top whitespace-normal"
								:	"w-[14%] align-top whitespace-normal"
							}
						>
							Topic
						</TableHead>
						<TableHead
							className={
								onEditFact ?
									"w-[39%] align-top whitespace-normal"
								:	"w-[44%] align-top whitespace-normal"
							}
						>
							Value
						</TableHead>
						<TableHead
							className={
								onEditFact ?
									"w-[11%] align-top whitespace-normal"
								:	"w-[12%] align-top whitespace-normal"
							}
						>
							Property
						</TableHead>
						<TableHead
							className={
								onEditFact ?
									"w-[12%] align-top whitespace-normal"
								:	"w-[12%] align-top whitespace-normal"
							}
						>
							Source
						</TableHead>
						<TableHead
							className={
								onEditFact ?
									"w-[9%] align-top whitespace-normal"
								:	"w-[10%] align-top whitespace-normal"
							}
						>
							Valid from
						</TableHead>
						<TableHead
							className={
								onEditFact ?
									"w-[9%] align-top whitespace-normal"
								:	"w-[8%] align-top whitespace-normal"
							}
						>
							Meta
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{facts.map((fact) => (
						<TableRow key={fact.id}>
							{onEditFact ? (
								<TableCell className="align-top whitespace-normal">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => onEditFact(fact)}
									>
										Edit
									</Button>
								</TableCell>
							) : null}
							<TableCell className="min-w-0 align-top whitespace-normal break-words">
								<div className="space-y-1">
									<p className="font-semibold">{fact.key}</p>
									<p className="break-all text-xs text-muted-foreground">{fact.id}</p>
								</div>
							</TableCell>
							<TableCell className="min-w-0 align-top whitespace-normal break-words [overflow-wrap:anywhere]">
								{fact.value}
							</TableCell>
							<TableCell className="min-w-0 align-top whitespace-normal break-words">
								<div className="space-y-1">
									<p className="font-medium">{fact.property.name}</p>
									<p className="break-all text-xs text-muted-foreground">
										{fact.property.id}
									</p>
								</div>
							</TableCell>
							<TableCell className="min-w-0 overflow-hidden align-top whitespace-normal break-words">
								<div className="min-w-0 space-y-1">
									<p className="break-all font-medium">{fact.source.fileId}</p>
									<p className="text-xs uppercase tracking-wide text-muted-foreground">
										{fact.source.fileType}
									</p>
								</div>
							</TableCell>
							<TableCell className="min-w-0 align-top text-sm whitespace-normal break-words">
								{fact.validFrom ?? (
									<span className="text-muted-foreground">—</span>
								)}
							</TableCell>
							<TableCell className="min-w-0 overflow-hidden align-top whitespace-normal break-words">
								<div className="flex min-w-0 max-w-full flex-wrap gap-1.5">
									<Badge
										variant="outline"
										className="h-auto max-w-full min-w-0 shrink whitespace-normal break-all py-1"
									>
										{fact.category}
									</Badge>
									<Badge variant="secondary" className="shrink-0">
										{Math.round(fact.confidenceScore * 100)}%
									</Badge>
									{fact.isGoldStandard ? (
										<Badge className="shrink-0">Gold</Badge>
									) : null}
								</div>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
