// @vitest-environment jsdom

import type * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CasesTable } from "#/components/CasesTable";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
		children: React.ReactNode;
		to?: string;
		params?: { caseId?: string };
	}) => (
		<a href={typeof to === "string" ? to.replace("$caseId", params?.caseId ?? "") : ""} {...props}>
			{children}
		</a>
	),
}));

describe("CasesTable", () => {
	it("renders linked case titles that navigate to the case detail route", () => {
		render(
			<CasesTable
				cases={[
					{
						id: "case-1",
						propertyId: "LIE-001",
						houseId: "LIE-001-H1",
						apartmentId: "LIE-001-H1-A1",
						ownerUserId: "user-1",
						caseKey: "a:LIE-001-H1-A1|invoice|window-invoice",
						closurePredicate: "invoice_paid",
						title: "Window invoice follow-up",
						summary: "Waiting for invoice confirmation",
						status: "open",
						createdAt: "2026-04-26T09:00:00.000Z",
						updatedAt: "2026-04-26T09:00:00.000Z",
						embedding: null,
						property: {
							id: "LIE-001",
							name: "Property",
						},
						house: {
							id: "LIE-001-H1",
							propertyId: "LIE-001",
							name: "House 1",
						},
						apartment: {
							id: "LIE-001-H1-A1",
							houseId: "LIE-001-H1",
							name: "Apartment 1",
						},
						owner: {
							id: "user-1",
							name: "Owner",
							email: "owner@example.com",
						},
					},
				]}
			/>,
		);

		const link = screen.getByRole("link", {
			name: "Window invoice follow-up",
		});
		expect(link.getAttribute("href")).toBe("/cases/case-1");
	});
});
