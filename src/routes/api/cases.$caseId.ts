import { createFileRoute } from "@tanstack/react-router";

import { getCaseDetail } from "#/services/caseDetails";

export const Route = createFileRoute("/api/cases/$caseId")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const result = await getCaseDetail(undefined, params.caseId);
				return Response.json(result);
			},
		},
	},
});
