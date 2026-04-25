import { GatekeeperResult, LlmJsonClient, RelevanceGatekeeper } from "../types";

export class Gatekeeper implements RelevanceGatekeeper {
  constructor(private readonly llmClient: LlmJsonClient) {}

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
    } catch {
      return false;
    }
  }
}
