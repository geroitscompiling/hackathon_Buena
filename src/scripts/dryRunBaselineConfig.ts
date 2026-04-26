import {
	type CaseDocumentExtractor,
	GeminiCaseExtractor,
} from "../engine/services/CaseExtractor";
import { GeminiService } from "../engine/services/GeminiService";
import type {
	BuildingFactExtractor,
	RelevanceGatekeeper,
} from "../engine/types";

export interface DryRunBaselineConfig {
	mode: "mock" | "live";
	maxNoisyFiles?: number;
	gatekeeper?: RelevanceGatekeeper;
	extractor?: BuildingFactExtractor;
	caseExtractor?: CaseDocumentExtractor;
	maxCasesPerRun?: number;
}

interface DryRunBaselineConfigDeps {
	createLiveCaseExtractor: () => CaseDocumentExtractor;
}

function parseOptionalNonNegativeInt(
	value: string | undefined,
	errorMessage: string,
): number | undefined {
	const raw = value?.trim();
	if (!raw) {
		return undefined;
	}
	const parsed = Number.parseInt(raw, 10);
	if (Number.isNaN(parsed) || parsed < 0) {
		throw new Error(errorMessage);
	}
	return parsed;
}

function createMockCaseExtractor(): CaseDocumentExtractor {
	return {
		extract: async (documentText) => {
			if (!documentText.includes("Subject:")) {
				return [];
			}
			return [
				{
					title: "Demo case from baseline email",
					summary: "Synthetic case for mock dry-run",
					status: "open" as const,
					scopeHint: "property" as const,
					primarySignal: "baseline-demo",
					confidence: 0.85,
				},
			];
		},
	};
}

export function createLiveCaseExtractor(model: string): CaseDocumentExtractor {
	return new GeminiCaseExtractor(new GeminiService({ model }), {
		strictErrors: true,
	});
}

export function resolveDryRunBaselineConfig(
	env: NodeJS.ProcessEnv,
	deps: DryRunBaselineConfigDeps,
): DryRunBaselineConfig {
	const mode = (env.BASELINE_MODE ?? "live").trim().toLowerCase();
	if (mode !== "mock" && mode !== "live") {
		throw new Error(
			`Unsupported BASELINE_MODE: ${mode}. Use "mock" or "live".`,
		);
	}

	const maxNoisyFiles = parseOptionalNonNegativeInt(
		env.BASELINE_FILE_LIMIT,
		"BASELINE_FILE_LIMIT must be a non-negative number when set",
	);

	const gatekeeper: RelevanceGatekeeper | undefined =
		mode === "mock"
			? {
					isRelevant: async () => true,
				}
			: undefined;
	const extractor: BuildingFactExtractor | undefined =
		mode === "mock"
			? {
					extract: async (documentText) => {
						if (documentText.includes("Subject:")) {
							return [
								{
									category: "maintenance",
									key: "repair",
									value:
										"Am 24.10. wurde eine zusaetzliche Heizungsreparatur fuer LIE-001-H1-A1 angefragt.",
									confidenceScore: 0.91,
								},
							];
						}
						return [
							{
								category: "financial",
								key: "payment",
								value:
									"Die Rechnung 20251203_DL-015_INV-00184 ist weiterhin offen.",
								confidenceScore: 0.88,
							},
						];
					},
				}
			: undefined;

	if (env.BASELINE_CREATE_CASES !== "1") {
		return {
			mode,
			maxNoisyFiles,
			gatekeeper,
			extractor,
		};
	}

	const maxCasesPerRun =
		mode === "mock"
			? parseOptionalNonNegativeInt(
					env.MAX_CASES_PER_RUN ?? "1",
					"MAX_CASES_PER_RUN must be a non-negative number when set",
				)
			: undefined;

	return {
		mode,
		maxNoisyFiles,
		gatekeeper,
		extractor,
		caseExtractor:
			mode === "mock"
				? createMockCaseExtractor()
				: deps.createLiveCaseExtractor(),
		maxCasesPerRun,
	};
}
