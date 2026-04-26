import { createFileRoute } from "@tanstack/react-router";

import { CaseLifecycleService } from "#/engine/services/CaseLifecycleService";
import { db } from "#/services/database";
import { SemanticIndexService } from "#/services/semanticIndex";
import { createMcpTools, handleMcpHttpRequest } from "#/mcp/server";

const semanticIndexService = new SemanticIndexService(db);
const lifecycle = new CaseLifecycleService(db, {
	semanticIndexService,
});

export const Route = createFileRoute("/api/mcp")({
	server: {
		handlers: {
			DELETE: ({ request }) =>
				handleMcpHttpRequest(
					request,
					createMcpTools(db, { lifecycle, semanticIndexService }),
				),
			GET: ({ request }) =>
				handleMcpHttpRequest(
					request,
					createMcpTools(db, { lifecycle, semanticIndexService }),
				),
			POST: ({ request }) =>
				handleMcpHttpRequest(
					request,
					createMcpTools(db, { lifecycle, semanticIndexService }),
				),
		},
	},
});
