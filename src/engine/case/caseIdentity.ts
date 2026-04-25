import type { ResolvedHierarchyScope } from "../services/HierarchyResolver";

/**
 * Deterministic case identity (R2.3):
 * `caseKey = normalize(scopeBucket + "|" + primarySignal + "|" + titleFingerprint)`
 *
 * - `scopeBucket`: `p:{propertyId}` | `h:{houseId}` | `a:{apartmentId}`
 * - `primarySignal`: extractor signal (invoice id, ticket ref, etc.), slug-stabilized
 * - `titleFingerprint`: first significant words of title, slug-stabilized
 */
export function scopeBucketFromResolvedScope(scope: ResolvedHierarchyScope): string {
	if (scope.scopeType === "apartment" && scope.apartmentId) {
		return `a:${scope.apartmentId}`;
	}
	if (scope.scopeType === "house" && scope.houseId) {
		return `h:${scope.houseId}`;
	}
	return `p:${scope.propertyId}`;
}

export function normalizeCaseKeyPart(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function titleFingerprint(title: string): string {
	const normalized = normalizeCaseKeyPart(title);
	return normalized.slice(0, 48) || "untitled";
}

export function computeCaseKey(
	scope: ResolvedHierarchyScope,
	primarySignal: string,
	title: string,
): string {
	const bucket = scopeBucketFromResolvedScope(scope);
	const sig = normalizeCaseKeyPart(primarySignal);
	const fp = titleFingerprint(title);
	return normalizeCaseKeyPart(`${bucket}|${sig}|${fp}`);
}
