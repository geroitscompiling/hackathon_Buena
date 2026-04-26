import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";

const CASE_STATUS_STYLES = {
	open: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/60 dark:text-emerald-200",
	in_progress:
		"border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/70 dark:bg-sky-950/60 dark:text-sky-200",
	investigating:
		"border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/60 dark:text-amber-200",
	blocked:
		"border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/60 dark:text-rose-200",
	on_hold:
		"border-stone-200 bg-stone-100 text-stone-800 dark:border-stone-700 dark:bg-stone-800/70 dark:text-stone-100",
	resolved:
		"border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900/70 dark:bg-violet-950/60 dark:text-violet-200",
} as const;

type CaseStatus = keyof typeof CASE_STATUS_STYLES;

function isCaseStatus(value: string): value is CaseStatus {
	return value in CASE_STATUS_STYLES;
}

function formatStatusLabel(status: string): string {
	return status.replaceAll("_", " ");
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
	const tone = isCaseStatus(status)
		? CASE_STATUS_STYLES[status]
		: "border-border bg-muted text-muted-foreground";

	return (
		<Badge
			variant="outline"
			className={cn(
				"rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase shadow-sm",
				tone,
				className,
			)}
		>
			<span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
			{formatStatusLabel(status)}
		</Badge>
	);
}
