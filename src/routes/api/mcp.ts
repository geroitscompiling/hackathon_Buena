import { createFileRoute } from "@tanstack/react-router";

import { handleMcpHttpRequest } from "#/mcp/server";

export const Route = createFileRoute("/api/mcp")({
	server: {
		handlers: {
			DELETE: ({ request }) => handleMcpHttpRequest(request),
			GET: ({ request }) => handleMcpHttpRequest(request),
			POST: ({ request }) => handleMcpHttpRequest(request),
		},
	},
});
