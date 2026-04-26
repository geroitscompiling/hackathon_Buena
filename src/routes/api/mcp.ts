import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/services/database";
import { createMcpTools, handleMcpHttpRequest } from "#/mcp/server";

export const Route = createFileRoute("/api/mcp")({
	server: {
		handlers: {
			DELETE: ({ request }) =>
				handleMcpHttpRequest(request, createMcpTools(db)),
			GET: ({ request }) =>
				handleMcpHttpRequest(request, createMcpTools(db)),
			POST: ({ request }) =>
				handleMcpHttpRequest(request, createMcpTools(db)),
		},
	},
});
