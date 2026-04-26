import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/cases")({
	component: CasesLayout,
});

function CasesLayout() {
	return <Outlet />;
}
