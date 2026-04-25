import type * as React from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import type {
	CreateApartmentArgs,
	CreateHouseArgs,
	CreatePropertyArgs,
	DeleteApartmentArgs,
	DeleteHouseArgs,
	DeletePropertyArgs,
	UpdateApartmentArgs,
	UpdateHouseArgs,
	UpdatePropertyArgs,
} from "#/db/queries";

export type PropertyHierarchyListItem = {
	id: string;
	name: string;
	houses: Array<{
		id: string;
		name: string;
		propertyId: string;
		apartments: Array<{
			id: string;
			houseId: string;
			name: string;
		}>;
	}>;
};

type PropertyHierarchyListProps = {
	properties: PropertyHierarchyListItem[];
	onCreateProperty?: (args: CreatePropertyArgs) => Promise<unknown>;
	onUpdateProperty?: (args: UpdatePropertyArgs) => Promise<unknown>;
	onDeleteProperty?: (args: DeletePropertyArgs) => Promise<unknown>;
	onCreateHouse?: (args: CreateHouseArgs) => Promise<unknown>;
	onUpdateHouse?: (args: UpdateHouseArgs) => Promise<unknown>;
	onDeleteHouse?: (args: DeleteHouseArgs) => Promise<unknown>;
	onCreateApartment?: (args: CreateApartmentArgs) => Promise<unknown>;
	onUpdateApartment?: (args: UpdateApartmentArgs) => Promise<unknown>;
	onDeleteApartment?: (args: DeleteApartmentArgs) => Promise<unknown>;
	onAfterMutation?: () => Promise<void> | void;
};

export function PropertyHierarchyList({
	properties,
	onAfterMutation,
	onCreateApartment,
	onCreateHouse,
	onCreateProperty,
	onDeleteApartment,
	onDeleteHouse,
	onDeleteProperty,
	onUpdateApartment,
	onUpdateHouse,
	onUpdateProperty,
}: PropertyHierarchyListProps) {
	return (
		<div className="space-y-5">
			<div className="flex justify-end">
				<PropertyDialog
					mode="create"
					onAfterMutation={onAfterMutation}
					onSubmit={onCreateProperty}
					trigger={<Button type="button">Add Property</Button>}
				/>
			</div>

			{properties.length === 0 ? (
				<Card className="rounded-[2rem] border-dashed">
					<CardContent className="py-6 text-sm text-muted-foreground">
						No properties found in the database yet.
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-5 lg:grid-cols-2">
					{properties.map((property) => (
						<Card key={property.id} className="rounded-[2rem] border-border/70">
							<CardHeader className="gap-3">
								<CardDescription className="island-kicker">
									Property
								</CardDescription>
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div>
										<CardTitle className="text-2xl text-[var(--sea-ink)]">
											{property.name}
										</CardTitle>
										<CardDescription className="mt-2 text-[var(--sea-ink-soft)]">
											{property.id}
										</CardDescription>
									</div>
									<div className="flex flex-wrap items-center justify-end gap-2">
										<Badge
											variant="secondary"
											className="rounded-full px-3 py-1"
										>
											{property.houses.length} houses
										</Badge>
										<HouseDialog
											mode="create"
											onAfterMutation={onAfterMutation}
											onSubmit={onCreateHouse}
											propertyId={property.id}
											propertyName={property.name}
											trigger={
												<Button size="sm" type="button" variant="outline">
													Add House
												</Button>
											}
										/>
										<PropertyDialog
											defaultName={property.name}
											id={property.id}
											mode="edit"
											onAfterMutation={onAfterMutation}
											onSubmit={onUpdateProperty}
											trigger={
												<Button size="sm" type="button" variant="outline">
													Edit
												</Button>
											}
										/>
										<DeleteDialog
											description="This removes the property, all nested houses and apartments, and related facts and cases."
											id={property.id}
											name={property.name}
											onAfterMutation={onAfterMutation}
											onDelete={onDeleteProperty}
											title="Delete Property"
											trigger={
												<Button size="sm" type="button" variant="destructive">
													Delete
												</Button>
											}
										/>
									</div>
								</div>
							</CardHeader>

							<CardContent className="space-y-4">
								{property.houses.map((house) => (
									<Card
										key={house.id}
										className="gap-4 rounded-2xl border-border/70 bg-white/55 py-4 shadow-none"
									>
										<CardContent className="space-y-3 px-4">
											<div className="flex flex-wrap items-center justify-between gap-4">
												<div>
													<p className="text-sm font-semibold text-[var(--sea-ink)]">
														{house.name}
													</p>
													<p className="text-xs text-[var(--sea-ink-soft)]">
														{house.id}
													</p>
												</div>
												<div className="flex flex-wrap items-center justify-end gap-2">
													<Badge variant="outline" className="rounded-full">
														{house.apartments.length} apartments
													</Badge>
													<ApartmentDialog
														houseId={house.id}
														houseName={house.name}
														mode="create"
														onAfterMutation={onAfterMutation}
														onSubmit={onCreateApartment}
														trigger={
															<Button size="sm" type="button" variant="outline">
																Add Apartment
															</Button>
														}
													/>
													<HouseDialog
														defaultName={house.name}
														id={house.id}
														mode="edit"
														onAfterMutation={onAfterMutation}
														onSubmit={onUpdateHouse}
														propertyId={property.id}
														propertyName={property.name}
														trigger={
															<Button size="sm" type="button" variant="outline">
																Edit
															</Button>
														}
													/>
													<DeleteDialog
														description="This removes the house, all nested apartments, and related cases and hierarchy links."
														id={house.id}
														name={house.name}
														onAfterMutation={onAfterMutation}
														onDelete={onDeleteHouse}
														title="Delete House"
														trigger={
															<Button
																size="sm"
																type="button"
																variant="destructive"
															>
																Delete
															</Button>
														}
													/>
												</div>
											</div>

											{house.apartments.length === 0 ? (
												<p className="text-sm text-[var(--sea-ink-soft)]">
													No apartments assigned.
												</p>
											) : (
												<ul className="grid gap-2 sm:grid-cols-2">
													{house.apartments.map((apartment) => (
														<li key={apartment.id}>
															<Card className="gap-3 rounded-xl border-[rgba(50,143,151,0.16)] bg-[rgba(79,184,178,0.1)] py-3 shadow-none">
																<CardContent className="space-y-3 px-3">
																	<div className="flex flex-wrap items-start justify-between gap-3">
																		<div>
																			<p className="text-sm font-medium text-[var(--sea-ink)]">
																				{apartment.name}
																			</p>
																			<p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
																				{apartment.id}
																			</p>
																		</div>
																		<div className="flex flex-wrap justify-end gap-2">
																			<ApartmentDialog
																				defaultName={apartment.name}
																				houseId={house.id}
																				houseName={house.name}
																				id={apartment.id}
																				mode="edit"
																				onAfterMutation={onAfterMutation}
																				onSubmit={onUpdateApartment}
																				trigger={
																					<Button
																						size="sm"
																						type="button"
																						variant="outline"
																					>
																						Edit
																					</Button>
																				}
																			/>
																			<DeleteDialog
																				description="This removes the apartment and related cases and apartment links."
																				id={apartment.id}
																				name={apartment.name}
																				onAfterMutation={onAfterMutation}
																				onDelete={onDeleteApartment}
																				title="Delete Apartment"
																				trigger={
																					<Button
																						size="sm"
																						type="button"
																						variant="destructive"
																					>
																						Delete
																					</Button>
																				}
																			/>
																		</div>
																	</div>
																</CardContent>
															</Card>
														</li>
													))}
												</ul>
											)}
										</CardContent>
									</Card>
								))}
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}

type PropertyDialogProps = {
	mode: "create" | "edit";
	id?: string;
	defaultName?: string;
	onSubmit?:
		| ((args: CreatePropertyArgs) => Promise<unknown>)
		| ((args: UpdatePropertyArgs) => Promise<unknown>);
	onAfterMutation?: () => Promise<void> | void;
	trigger: React.ReactNode;
};

function PropertyDialog({
	defaultName = "",
	id = "",
	mode,
	onAfterMutation,
	onSubmit,
	trigger,
}: PropertyDialogProps) {
	return (
		<EntityDialog
			defaultId={id}
			defaultName={defaultName}
			entityLabel="Property"
			mode={mode}
			onAfterMutation={onAfterMutation}
			onSubmit={async ({ id, name }) => {
				if (!onSubmit) {
					return;
				}

				if (mode === "create") {
					await (onSubmit as (args: CreatePropertyArgs) => Promise<unknown>)({
						id,
						name,
					});
					return;
				}

				await (onSubmit as (args: UpdatePropertyArgs) => Promise<unknown>)({
					id,
					name,
				});
			}}
			trigger={trigger}
		/>
	);
}

type HouseDialogProps = {
	mode: "create" | "edit";
	id?: string;
	defaultName?: string;
	propertyId: string;
	propertyName: string;
	onSubmit?:
		| ((args: CreateHouseArgs) => Promise<unknown>)
		| ((args: UpdateHouseArgs) => Promise<unknown>);
	onAfterMutation?: () => Promise<void> | void;
	trigger: React.ReactNode;
};

function HouseDialog({
	defaultName = "",
	id = "",
	mode,
	onAfterMutation,
	onSubmit,
	propertyId,
	propertyName,
	trigger,
}: HouseDialogProps) {
	return (
		<EntityDialog
			defaultId={id}
			defaultName={defaultName}
			entityLabel="House"
			mode={mode}
			onAfterMutation={onAfterMutation}
			onSubmit={async ({ id, name }) => {
				if (!onSubmit) {
					return;
				}

				if (mode === "create") {
					await (onSubmit as (args: CreateHouseArgs) => Promise<unknown>)({
						id,
						name,
						propertyId,
					});
					return;
				}

				await (onSubmit as (args: UpdateHouseArgs) => Promise<unknown>)({
					id,
					name,
				});
			}}
			parentLabel={propertyName}
			trigger={trigger}
		/>
	);
}

type ApartmentDialogProps = {
	mode: "create" | "edit";
	id?: string;
	defaultName?: string;
	houseId: string;
	houseName: string;
	onSubmit?:
		| ((args: CreateApartmentArgs) => Promise<unknown>)
		| ((args: UpdateApartmentArgs) => Promise<unknown>);
	onAfterMutation?: () => Promise<void> | void;
	trigger: React.ReactNode;
};

function ApartmentDialog({
	defaultName = "",
	houseId,
	houseName,
	id = "",
	mode,
	onAfterMutation,
	onSubmit,
	trigger,
}: ApartmentDialogProps) {
	return (
		<EntityDialog
			defaultId={id}
			defaultName={defaultName}
			entityLabel="Apartment"
			mode={mode}
			onAfterMutation={onAfterMutation}
			onSubmit={async ({ id, name }) => {
				if (!onSubmit) {
					return;
				}

				if (mode === "create") {
					await (onSubmit as (args: CreateApartmentArgs) => Promise<unknown>)({
						houseId,
						id,
						name,
					});
					return;
				}

				await (onSubmit as (args: UpdateApartmentArgs) => Promise<unknown>)({
					id,
					name,
				});
			}}
			parentLabel={houseName}
			trigger={trigger}
		/>
	);
}

type EntityDialogProps = {
	mode: "create" | "edit";
	entityLabel: "Property" | "House" | "Apartment";
	defaultId: string;
	defaultName: string;
	parentLabel?: string;
	onSubmit: (args: { id: string; name: string }) => Promise<void>;
	onAfterMutation?: () => Promise<void> | void;
	trigger: React.ReactNode;
};

function EntityDialog({
	defaultId,
	defaultName,
	entityLabel,
	mode,
	onAfterMutation,
	onSubmit,
	parentLabel,
	trigger,
}: EntityDialogProps) {
	return (
		<Dialog>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{mode === "create"
							? `Create ${entityLabel}`
							: `Edit ${entityLabel}`}
					</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? `Add a new ${entityLabel.toLowerCase()} to the hierarchy.`
							: `Update the ${entityLabel.toLowerCase()} details.`}
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={async (event) => {
						event.preventDefault();

						const formData = new FormData(event.currentTarget);
						const id = String(formData.get("id") ?? "");
						const name = String(formData.get("name") ?? "");

						await onSubmit({ id, name });
						await onAfterMutation?.();

						findDialogCloseButton(event.currentTarget)?.click();
					}}
				>
					{mode === "create" ? (
						<div className="space-y-2">
							<Label htmlFor={`${entityLabel.toLowerCase()}-id`}>
								{entityLabel} ID
							</Label>
							<Input
								defaultValue={defaultId}
								id={`${entityLabel.toLowerCase()}-id`}
								name="id"
							/>
						</div>
					) : (
						<div className="space-y-2">
							<Label>ID</Label>
							<div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
								{defaultId}
							</div>
							<input name="id" type="hidden" value={defaultId} />
						</div>
					)}

					{parentLabel ? (
						<div className="space-y-2">
							<Label>Parent</Label>
							<div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
								{parentLabel}
							</div>
						</div>
					) : null}

					<div className="space-y-2">
						<Label htmlFor={`${entityLabel.toLowerCase()}-name`}>
							{entityLabel} Name
						</Label>
						<Input
							defaultValue={defaultName}
							id={`${entityLabel.toLowerCase()}-name`}
							name="name"
						/>
					</div>

					<DialogFooter>
						<DialogClose asChild>
							<Button type="button" variant="outline">
								Cancel
							</Button>
						</DialogClose>
						<Button type="submit">
							{mode === "create"
								? `Create ${entityLabel}`
								: `Save ${entityLabel}`}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

type DeleteDialogProps = {
	title: string;
	description: string;
	id: string;
	name: string;
	onDelete?: ((args: { id: string }) => Promise<unknown>) | undefined;
	onAfterMutation?: () => Promise<void> | void;
	trigger: React.ReactNode;
};

function DeleteDialog({
	description,
	id,
	name,
	onAfterMutation,
	onDelete,
	title,
	trigger,
}: DeleteDialogProps) {
	return (
		<Dialog>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="rounded-md border border-input bg-muted/40 px-3 py-3 text-sm">
						<p className="font-medium">{name}</p>
						<p className="text-muted-foreground">{id}</p>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button type="button" variant="outline">
								Cancel
							</Button>
						</DialogClose>
						<Button
							type="button"
							variant="destructive"
							onClick={async (event) => {
								await onDelete?.({ id });
								await onAfterMutation?.();
								findDialogCloseButton(event.currentTarget)?.click();
							}}
						>
							Delete
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function findDialogCloseButton(element: Element) {
	return element
		.closest("[data-slot='dialog-content']")
		?.querySelector<HTMLButtonElement>("[data-slot='dialog-close']");
}
