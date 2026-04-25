// @vitest-environment jsdom

import type * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppSidebar } from "#/components/AppSidebar";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		...props
	}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
		children: React.ReactNode;
		to?: string;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

vi.mock("#/components/ui/sidebar", () => ({
	Sidebar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SidebarContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SidebarGroupContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SidebarHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SidebarMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SidebarMenuButton: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
		asChild ? children : <button type="button">{children}</button>,
	SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("AppSidebar", () => {
	it("renders the properties navigation entry", () => {
		render(<AppSidebar />);

		expect(screen.getByText("Navigation")).toBeTruthy();
		expect(screen.getByRole("link", { name: "Properties" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "Cases" })).toBeTruthy();
		expect(screen.getByRole("link", { name: "Facts" })).toBeTruthy();
	});
});
