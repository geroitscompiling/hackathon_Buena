import type { GatekeeperResult, LlmJsonClient, RelevanceGatekeeper } from "../types";

interface GatekeeperOptions {
  strictErrors?: boolean;
}

export class Gatekeeper implements RelevanceGatekeeper {
  constructor(
    private readonly llmClient: LlmJsonClient,
    private readonly options: GatekeeperOptions = {}
  ) {}

  async isRelevant(documentText: string): Promise<boolean> {
    const prompt = `
You are a strict relevance filter for a property-management ingestion pipeline.
Return valid JSON with shape: {"isRelevant": boolean}.

Mark as relevant only if the text contains actionable signals related to property management:
- maintenance incidents or repairs
- invoices/payments/banking references
- governance/legal owner/tenant decisions

Document:
"""${documentText}"""
`;

    try {
      const response = await this.llmClient.generateJson<GatekeeperResult>(prompt);
      return response.isRelevant === true;
    } catch (error) {
      if (this.options.strictErrors) {
        throw new Error(
          `Gatekeeper failed to evaluate document relevance: ${
            error instanceof Error ? error.message : "unknown error"
          }`
        );
      }
      return false;
    }
  }
}
