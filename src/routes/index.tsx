import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";

import { PropertyHierarchyList } from "#/components/PropertyHierarchyList";
import {
	createApartment,
	createApartmentSchema,
	createHouse,
	createHouseSchema,
	createProperty,
	createPropertySchema,
	deleteApartment,
	deleteApartmentSchema,
	deleteHouse,
	deleteHouseSchema,
	deleteProperty,
	deletePropertySchema,
	listPropertyHierarchies,
	updateApartment,
	updateApartmentSchema,
	updateHouse,
	updateHouseSchema,
	updateProperty,
	updatePropertySchema,
} from "#/db/queries";

const getPropertyHierarchies = createServerFn({
	method: "GET",
}).handler(async () => {
	return listPropertyHierarchies(undefined, {
		limit: 100,
	});
});

const createPropertyAction = createServerFn({
	method: "POST",
})
	.inputValidator((data) => createPropertySchema.parse(data))
	.handler(async ({ data }) => createProperty(undefined, data));

const updatePropertyAction = createServerFn({
	method: "POST",
})
	.inputValidator((data) => updatePropertySchema.parse(data))
	.handler(async ({ data }) => updateProperty(undefined, data));

const deletePropertyAction = createServerFn({
	method: "POST",
})
	.inputValidator((data) => deletePropertySchema.parse(data))
	.handler(async ({ data }) => deleteProperty(undefined, data));

const createHouseAction = createServerFn({
	method: "POST",
})
	.inputValidator((data) => createHouseSchema.parse(data))
	.handler(async ({ data }) => createHouse(undefined, data));

const updateHouseAction = createServerFn({
	method: "POST",
})
	.inputValidator((data) => updateHouseSchema.parse(data))
	.handler(async ({ data }) => updateHouse(undefined, data));

const deleteHouseAction = createServerFn({
	method: "POST",
})
	.inputValidator((data) => deleteHouseSchema.parse(data))
	.handler(async ({ data }) => deleteHouse(undefined, data));

const createApartmentAction = createServerFn({
	method: "POST",
})
	.inputValidator((data) => createApartmentSchema.parse(data))
	.handler(async ({ data }) => createApartment(undefined, data));

const updateApartmentAction = createServerFn({
	method: "POST",
})
	.inputValidator((data) => updateApartmentSchema.parse(data))
	.handler(async ({ data }) => updateApartment(undefined, data));

const deleteApartmentAction = createServerFn({
	method: "POST",
})
	.inputValidator((data) => deleteApartmentSchema.parse(data))
	.handler(async ({ data }) => deleteApartment(undefined, data));

export const Route = createFileRoute("/")({
	component: App,
	loader: async () => await getPropertyHierarchies(),
});

function App() {
	const properties = Route.useLoaderData();
	const router = useRouter();

	return (
		<main className="page-wrap px-4 pb-12 pt-14">
			<section className="island-shell rise-in relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
				<div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(79,184,178,0.32),transparent_66%)]" />
				<div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(47,106,74,0.18),transparent_66%)]" />
				<p className="island-kicker mb-3">Property Hierarchy</p>
				<h1 className="display-title mb-5 max-w-4xl text-4xl leading-[1.02] font-bold tracking-tight text-[var(--sea-ink)] sm:text-6xl">
					Properties, houses, and apartments from the database.
				</h1>
				<p className="max-w-3xl text-base text-[var(--sea-ink-soft)] sm:text-lg">
					The home page now renders the live hierarchy stored in Drizzle, using
					the same tool registry exposed through the MCP server and HTTP API.
				</p>
			</section>

			<section className="mt-8">
				<div className="mb-5 flex items-center justify-between gap-4">
					<div>
						<p className="island-kicker mb-2">Overview</p>
						<h2 className="text-2xl font-semibold text-[var(--sea-ink)]">
							{properties.length} properties loaded
						</h2>
					</div>
				</div>

				<PropertyHierarchyList
					properties={properties}
					onAfterMutation={() => router.invalidate()}
					onCreateProperty={(args) => createPropertyAction({ data: args })}
					onUpdateProperty={(args) => updatePropertyAction({ data: args })}
					onDeleteProperty={(args) => deletePropertyAction({ data: args })}
					onCreateHouse={(args) => createHouseAction({ data: args })}
					onUpdateHouse={(args) => updateHouseAction({ data: args })}
					onDeleteHouse={(args) => deleteHouseAction({ data: args })}
					onCreateApartment={(args) => createApartmentAction({ data: args })}
					onUpdateApartment={(args) => updateApartmentAction({ data: args })}
					onDeleteApartment={(args) => deleteApartmentAction({ data: args })}
				/>
			</section>
		</main>
	);
}
