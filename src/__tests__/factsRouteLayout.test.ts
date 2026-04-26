import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("facts route layout", () => {
	it("keeps /facts as a layout route so scoped child pages can render", async () => {
		const routeSource = await readFile(new URL("../routes/facts.tsx", import.meta.url), "utf8");

		expect(routeSource).toContain("Outlet");
		expect(routeSource).not.toContain("FactsTable");
		expect(routeSource).not.toContain("useLoaderData");
	});
});
