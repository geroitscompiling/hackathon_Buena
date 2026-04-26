import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/facts")({
	component: FactsLayout,
});

function FactsLayout() {
	return (
		<Outlet />
	);
}
