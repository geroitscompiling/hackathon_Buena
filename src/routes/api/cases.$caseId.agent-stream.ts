import { createFileRoute } from "@tanstack/react-router";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { watchCaseDetailUpdates } from "#/services/caseDetailStream";

export const Route = createFileRoute("/api/cases/$caseId/agent-stream")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const stream = createUIMessageStream({
					execute: async ({ writer }) => {
						writer.write({ type: "start" });

						for await (const update of watchCaseDetailUpdates({
							caseId: params.caseId,
							signal: request.signal,
						})) {
							writer.write({
								type: "data-case-detail-update",
								data: update,
								transient: true,
							});
						}

						writer.write({ type: "finish" });
					},
				});

				return createUIMessageStreamResponse({ stream });
			},
		},
	},
});
