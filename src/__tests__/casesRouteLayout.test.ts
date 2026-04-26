import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("cases route layout", () => {
	it("keeps /cases as a layout route so case detail child pages can render", async () => {
		const routeSource = await readFile(new URL("../routes/cases.tsx", import.meta.url), "utf8");

		expect(routeSource).toContain("Outlet");
		expect(routeSource).not.toContain("CasesTable");
		expect(routeSource).not.toContain("useLoaderData");
	});
});
