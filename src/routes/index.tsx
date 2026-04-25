import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";

import { PropertyHierarchyList } from "#/components/PropertyHierarchyList";
import {
	createApartment,
	createApartmentSchema,
	deleteApartment,
	deleteApartmentSchema,
	updateApartment,
	updateApartmentSchema,
} from "#/services/apartments";
import {
	createHouse,
	createHouseSchema,
	deleteHouse,
	deleteHouseSchema,
	updateHouse,
	updateHouseSchema,
} from "#/services/houses";
import {
	createProperty,
	createPropertySchema,
	deleteProperty,
	deletePropertySchema,
	listPropertyHierarchies,
	updateProperty,
	updatePropertySchema,
} from "#/services/properties";

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
		<main className="px-4 py-6 md:px-6">
			<section className="mb-5 flex items-center justify-between gap-4">
				<div>
					<p className="island-kicker mb-2">Properties</p>
					<h1 className="text-2xl font-semibold text-[var(--sea-ink)]">
						{properties.length} properties loaded
					</h1>
				</div>
			</section>

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
		</main>
	);
}
