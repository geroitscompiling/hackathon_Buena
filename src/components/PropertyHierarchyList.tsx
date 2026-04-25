import type * as React from "react";
import { Link } from "@tanstack/react-router";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
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
	DeleteApartmentArgs,
	UpdateApartmentArgs,
} from "#/services/apartments";
import type {
	CreateHouseArgs,
	DeleteHouseArgs,
	UpdateHouseArgs,
} from "#/services/houses";
import type {
	CreatePropertyArgs,
	DeletePropertyArgs,
	PropertyHierarchy,
	UpdatePropertyArgs,
} from "#/services/properties";

export type PropertyHierarchyListItem = PropertyHierarchy;

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
				<div className="border border-dashed px-6 py-6 text-sm text-muted-foreground">
					No properties found in the database yet.
				</div>
			) : (
				<Accordion className="border-t" collapsible type="single">
					{properties.map((property) => (
						<AccordionItem
							key={property.id}
							value={property.id}
							className="border-b"
						>
							<div className="flex flex-wrap items-center justify-between gap-3 py-4">
								<AccordionTrigger className="min-w-0 flex-1 py-1 hover:no-underline">
									<div className="min-w-0 text-left">
										<span className="block truncate text-base font-semibold">
											{property.name}
										</span>
										<span className="mt-1 block text-sm text-muted-foreground">
											{property.id}
										</span>
									</div>
								</AccordionTrigger>
								<div className="flex flex-wrap items-center justify-end gap-2">
									<Badge variant="secondary">
										{property.houses.length} houses
									</Badge>
									<Button asChild size="sm" type="button" variant="outline">
										<Link
											params={{
												scopeId: property.id,
												scopeType: "property",
											}}
											to="/facts/$scopeType/$scopeId"
										>
											Show facts
										</Link>
									</Button>
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

							<AccordionContent className="pb-4 pl-6">
								{property.houses.length === 0 ? (
									<p className="text-sm text-muted-foreground">No houses assigned.</p>
								) : (
									<Accordion className="border-l" collapsible type="single">
										{property.houses.map((house) => (
											<AccordionItem
												key={house.id}
												value={house.id}
												className="border-b last:border-b-0"
											>
												<div className="flex flex-wrap items-center justify-between gap-3 py-3 pl-4">
													<AccordionTrigger className="min-w-0 flex-1 py-1 hover:no-underline">
														<div className="min-w-0 text-left">
															<span className="block truncate text-sm font-semibold">
																{house.name}
															</span>
															<span className="mt-1 block text-xs text-muted-foreground">
																{house.id}
															</span>
														</div>
													</AccordionTrigger>
													<div className="flex flex-wrap items-center justify-end gap-2">
														<Badge variant="outline">
															{house.apartments.length} apartments
														</Badge>
														<Button asChild size="sm" type="button" variant="outline">
															<Link
																params={{
																	scopeId: house.id,
																	scopeType: "house",
																}}
																to="/facts/$scopeType/$scopeId"
															>
																Show facts
															</Link>
														</Button>
														<ApartmentDialog
															houseId={house.id}
															houseName={house.name}
															mode="create"
															onAfterMutation={onAfterMutation}
															onSubmit={onCreateApartment}
															trigger={
																<Button
																	size="sm"
																	type="button"
																	variant="outline"
																>
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

												<AccordionContent className="pb-3 pl-6">
													{house.apartments.length === 0 ? (
														<p className="text-sm text-muted-foreground">No apartments assigned.</p>
													) : (
														<ul className="border-l">
															{house.apartments.map((apartment) => (
																<li
																	key={apartment.id}
																	className="flex flex-wrap items-center justify-between gap-3 border-b py-3 pl-4 last:border-b-0"
																>
															<div className="min-w-0 flex-1">
																		<div className="block py-1">
																			<span className="block truncate text-sm font-medium">
																				{apartment.name}
																			</span>
																			<span className="mt-1 block text-xs text-muted-foreground">
																				{apartment.id}
																			</span>
																		</div>
																	</div>
																	<div className="flex flex-wrap justify-end gap-2">
																		<Button asChild size="sm" type="button" variant="outline">
																			<Link
																				params={{
																					scopeId: apartment.id,
																					scopeType: "apartment",
																				}}
																				to="/facts/$scopeType/$scopeId"
																			>
																				Show facts
																			</Link>
																		</Button>
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
																</li>
															))}
														</ul>
													)}
												</AccordionContent>
											</AccordionItem>
										))}
									</Accordion>
								)}
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
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
								placeholder={`e.g. ${entityLabel === "Property" ? "LIE-003" : entityLabel === "House" ? "LIE-003-H1" : "LIE-003-H1-A1"}`}
								required
							/>
						</div>
					) : (
						<input name="id" type="hidden" value={defaultId} />
					)}

					<div className="space-y-2">
						<Label htmlFor={`${entityLabel.toLowerCase()}-name`}>
							{entityLabel} Name
						</Label>
						<Input
							defaultValue={defaultName}
							id={`${entityLabel.toLowerCase()}-name`}
							name="name"
							placeholder={`${entityLabel} name`}
							required
						/>
					</div>

					{parentLabel ? (
						<p className="text-sm text-muted-foreground">Parent: {parentLabel}</p>
					) : null}

					<DialogFooter>
						<DialogClose asChild>
							<Button type="button" variant="outline">
								Cancel
							</Button>
						</DialogClose>
						<Button type="submit">
							{mode === "create" ? `Create ${entityLabel}` : `Save ${entityLabel}`}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

type DeleteDialogProps<TArgs extends { id: string }> = {
	title: string;
	description: string;
	id: string;
	name: string;
	onDelete?: (args: TArgs) => Promise<unknown>;
	onAfterMutation?: () => Promise<void> | void;
	trigger: React.ReactNode;
};

function DeleteDialog<TArgs extends { id: string }>({
	description,
	id,
	name,
	onAfterMutation,
	onDelete,
	title,
	trigger,
}: DeleteDialogProps<TArgs>) {
	return (
		<Dialog>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<div className="rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-sm text-[var(--sea-ink)]">
					{name} <span className="text-[var(--sea-ink-soft)]">({id})</span>
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
							if (!onDelete) {
								return;
							}

							await onDelete({ id } as TArgs);
							await onAfterMutation?.();
							findDialogCloseButton(event.currentTarget.closest("[role=dialog]"))?.click();
						}}
					>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function findDialogCloseButton(element: Element | null) {
	return (
		element?.closest("[role=dialog]")?.querySelector<HTMLElement>(
			"[data-slot='dialog-close']",
		) ?? null
	);
}
