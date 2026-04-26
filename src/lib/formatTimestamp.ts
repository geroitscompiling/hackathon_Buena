const MONTHS_SHORT = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

/**
 * Human-readable date/time for UI. Uses UTC fields so SSR (often UTC) and the
 * browser agree on the same ISO instant, and avoids `Intl`/`toLocaleString`
 * (Node vs browser can differ, e.g. comma vs "at" between date and time).
 */
export function formatMediumDateTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) {
		return iso;
	}
	const day = d.getUTCDate();
	const month = MONTHS_SHORT[d.getUTCMonth()];
	const year = d.getUTCFullYear();
	const hours = String(d.getUTCHours()).padStart(2, "0");
	const minutes = String(d.getUTCMinutes()).padStart(2, "0");
	return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
}
