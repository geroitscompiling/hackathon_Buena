/**
 * Best-effort scope signals from raw document text (eml/pdf fixture text).
 * Mirrors `deriveDocumentMetadataFromFact` heuristics for case extraction.
 */
export function deriveDocumentMetadataFromText(raw: string): {
	houseId?: string;
	apartmentId?: string;
	unitLabel?: string;
} {
	const apartmentMatch = raw.match(/\b([A-Z]{3}-\d{3}-H\d+-A\d+)\b/);
	if (apartmentMatch?.[1]) {
		const apartmentId = apartmentMatch[1];
		const houseId = apartmentId.split("-A")[0];
		return { houseId, apartmentId };
	}

	const houseMatch = raw.match(/\b([A-Z]{3}-\d{3}-H\d+)\b/);
	if (houseMatch?.[1]) {
		return { houseId: houseMatch[1] };
	}

	const unitLabelMatch = raw.match(/\b(Unit\s+\d+)\b/i);
	if (unitLabelMatch?.[1]) {
		return { unitLabel: unitLabelMatch[1] };
	}

	return {};
}
