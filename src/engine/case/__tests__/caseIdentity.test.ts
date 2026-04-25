import { describe, expect, it } from "vitest";
import {
	computeCaseKey,
	normalizeCaseKeyPart,
	scopeBucketFromResolvedScope,
	titleFingerprint,
} from "../caseIdentity";

/**
 * Documented identity formula (R2.3):
 * caseKey = normalize(scopeBucket + "|" + primarySignal + "|" + titleFingerprint)
 * - scopeBucket: p:{propertyId} | h:{houseId} | a:{apartmentId}
 * - primarySignal + titleFingerprint: slug-normalized (lowercase, non-alnum → '-')
 */
describe("caseIdentity (R2.3)", () => {
	it("builds stable keys for apartment scope", () => {
		const scope = {
			scopeType: "apartment" as const,
			propertyId: "LIE-001",
			houseId: "LIE-001-H1",
			apartmentId: "LIE-001-H1-A1",
		};
		expect(scopeBucketFromResolvedScope(scope)).toBe("a:LIE-001-H1-A1");
		expect(
			computeCaseKey(scope, "INV-2044", "Heating invoice dispute Q1"),
		).toBe(
			normalizeCaseKeyPart(
				`a:LIE-001-H1-A1|${normalizeCaseKeyPart("INV-2044")}|${titleFingerprint("Heating invoice dispute Q1")}`,
			),
		);
	});

	it("matches across phrasing when primary signal and title fingerprint align", () => {
		const scope = {
			scopeType: "property" as const,
			propertyId: "LIE-001",
		};
		const k1 = computeCaseKey(scope, "roof-damage-2026", "Roof damage after storm");
		const k2 = computeCaseKey(scope, "roof-damage-2026", "Roof Damage — After Storm");
		expect(k1).toBe(k2);
	});
});
