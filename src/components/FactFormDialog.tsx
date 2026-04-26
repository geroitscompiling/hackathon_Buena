import { type FormEvent, useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import type { FactListItem } from "#/services/facts";
import type {
	CreateHumanFactArgs,
	FactsScopeContext,
	UpdateHumanFactArgs,
} from "#/services/humanFacts";

const CATEGORY_OPTIONS = [
	{ value: "core_erp", label: "Core ERP" },
	{ value: "financial", label: "Financial" },
	{ value: "maintenance", label: "Maintenance" },
	{ value: "governance", label: "Governance" },
] as const;

export type FactFormDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: "create" | "edit";
	properties: Array<{ id: string; name: string }>;
	scopeDefaults?: FactsScopeContext | null;
	editingFact: FactListItem | null;
	onCreate: (args: CreateHumanFactArgs) => Promise<void>;
	onUpdate: (args: UpdateHumanFactArgs) => Promise<void>;
};

export function FactFormDialog({
	open,
	onOpenChange,
	mode,
	properties,
	scopeDefaults,
	editingFact,
	onCreate,
	onUpdate,
}: FactFormDialogProps) {
	const [propertyId, setPropertyId] = useState("");
	const [category, setCategory] =
		useState<(typeof CATEGORY_OPTIONS)[number]["value"]>("maintenance");
	const [key, setKey] = useState("");
	const [value, setValue] = useState("");
	const [validFrom, setValidFrom] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	useEffect(() => {
		if (!open) {
			return;
		}
		setError(null);
		if (mode === "edit" && editingFact) {
			setPropertyId(editingFact.propertyId);
			setCategory(
				(CATEGORY_OPTIONS.find((c) => c.value === editingFact.category)
					?.value ??
					"maintenance") as (typeof CATEGORY_OPTIONS)[number]["value"],
			);
			setKey(editingFact.key);
			setValue(editingFact.value);
			setValidFrom(editingFact.validFrom ?? "");
			return;
		}
		setCategory("maintenance");
		setKey("");
		setValue("");
		setValidFrom("");
		const nextPropertyId = scopeDefaults?.propertyId ?? properties[0]?.id ?? "";
		setPropertyId(nextPropertyId);
	}, [open, mode, editingFact, scopeDefaults, properties]);

	const effectivePropertyId = scopeDefaults?.propertyId ?? propertyId;

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		if (mode === "create") {
			if (!effectivePropertyId) {
				setError("Select a property.");
				return;
			}
			if (!key.trim() || !value.trim()) {
				setError("Topic and value are required.");
				return;
			}
			const vf = validFrom.trim();
			if (vf && !/^\d{4}-\d{2}-\d{2}$/.test(vf)) {
				setError("Valid from must be YYYY-MM-DD or empty.");
				return;
			}
			setPending(true);
			try {
				await onCreate({
					apartmentIds: scopeDefaults?.presetApartmentIds.length
						? scopeDefaults.presetApartmentIds
						: undefined,
					category,
					houseIds: scopeDefaults?.presetHouseIds.length
						? scopeDefaults.presetHouseIds
						: undefined,
					key: key.trim(),
					propertyId: effectivePropertyId,
					validFrom: vf || undefined,
					value: value.trim(),
				});
				onOpenChange(false);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Could not save fact.");
			} finally {
				setPending(false);
			}
			return;
		}

		if (!editingFact) {
			return;
		}
		const vf = validFrom.trim();
		if (vf && !/^\d{4}-\d{2}-\d{2}$/.test(vf)) {
			setError("Valid from must be YYYY-MM-DD or empty.");
			return;
		}
		setPending(true);
		try {
			const payload: UpdateHumanFactArgs = { id: editingFact.id };
			if (category !== editingFact.category) {
				payload.category = category;
			}
			if (key.trim() !== editingFact.key) {
				payload.key = key.trim();
			}
			if (value.trim() !== editingFact.value) {
				payload.value = value.trim();
			}
			const nextValid = vf || null;
			const prevValid = editingFact.validFrom ?? null;
			if (nextValid !== prevValid) {
				payload.validFrom = nextValid;
			}
			if (
				payload.category === undefined &&
				payload.key === undefined &&
				payload.value === undefined &&
				payload.validFrom === undefined
			) {
				onOpenChange(false);
				return;
			}
			await onUpdate(payload);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not update fact.");
		} finally {
			setPending(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>
							{mode === "create" ? "Add fact" : "Edit fact"}
						</DialogTitle>
					</DialogHeader>

					<div className="grid gap-4 py-2">
						{mode === "edit" && editingFact?.isGoldStandard ? (
							<p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
								This row is marked as gold (ERP). Saving replaces the stored
								value—use this only for deliberate corrections.
							</p>
						) : null}

						{mode === "create" && !scopeDefaults ? (
							<div className="grid gap-2">
								<Label htmlFor="fact-property">Property</Label>
								<Select
									value={propertyId || undefined}
									onValueChange={setPropertyId}
								>
									<SelectTrigger id="fact-property">
										<SelectValue placeholder="Choose property" />
									</SelectTrigger>
									<SelectContent>
										{properties.map((p) => (
											<SelectItem key={p.id} value={p.id}>
												{p.name} ({p.id})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						) : null}

						{mode === "create" && scopeDefaults ? (
							<p className="text-sm text-muted-foreground">
								Property{" "}
								<span className="font-medium text-foreground">
									{effectivePropertyId}
								</span>
								{scopeDefaults.presetHouseIds.length
									? `, houses: ${scopeDefaults.presetHouseIds.join(", ")}`
									: null}
								{scopeDefaults.presetApartmentIds.length
									? `, units: ${scopeDefaults.presetApartmentIds.join(", ")}`
									: null}
							</p>
						) : null}

						<div className="grid gap-2">
							<Label htmlFor="fact-category">Topic category</Label>
							<Select
								value={category}
								onValueChange={(v) =>
									setCategory(v as (typeof CATEGORY_OPTIONS)[number]["value"])
								}
							>
								<SelectTrigger id="fact-category">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CATEGORY_OPTIONS.map((c) => (
										<SelectItem key={c.value} value={c.value}>
											{c.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="fact-key">Topic</Label>
							<Input
								id="fact-key"
								value={key}
								onChange={(ev) => setKey(ev.target.value)}
								autoComplete="off"
							/>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="fact-value">Value</Label>
							<Input
								id="fact-value"
								value={value}
								onChange={(ev) => setValue(ev.target.value)}
								autoComplete="off"
							/>
						</div>

						<div className="grid gap-2">
							<Label htmlFor="fact-valid-from">Valid from (optional)</Label>
							<Input
								id="fact-valid-from"
								type="date"
								value={validFrom}
								onChange={(ev) => setValidFrom(ev.target.value)}
							/>
							<p className="text-xs text-muted-foreground">
								Calendar date when this fact applies (not the ingestion time).
							</p>
						</div>

						{error ? (
							<p className="text-sm text-destructive" role="alert">
								{error}
							</p>
						) : null}
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={pending}>
							{pending ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
