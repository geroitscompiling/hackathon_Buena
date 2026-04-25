import { Badge } from "#/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";

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
};

export function PropertyHierarchyList({
	properties,
}: PropertyHierarchyListProps) {
	if (properties.length === 0) {
		return (
			<Card className="rounded-[2rem] border-dashed">
				<CardContent className="py-2 text-sm text-muted-foreground">
					No properties found in the database yet.
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="grid gap-5 lg:grid-cols-2">
			{properties.map((property) => (
				<Card key={property.id} className="rounded-[2rem] border-border/70">
					<CardHeader className="gap-3">
						<CardDescription className="island-kicker">
							Property
						</CardDescription>
						<div className="flex items-start justify-between gap-4">
							<div>
								<CardTitle className="text-2xl text-[var(--sea-ink)]">
									{property.name}
								</CardTitle>
								<CardDescription className="mt-2 text-[var(--sea-ink-soft)]">
									{property.id}
								</CardDescription>
							</div>
							<Badge variant="secondary" className="rounded-full px-3 py-1">
								{property.houses.length} houses
							</Badge>
						</div>
					</CardHeader>

					<CardContent className="space-y-4">
						{property.houses.map((house) => (
							<Card
								key={house.id}
								className="gap-4 rounded-2xl border-border/70 bg-white/55 py-4 shadow-none"
							>
								<CardContent className="space-y-3 px-4">
									<div className="flex items-center justify-between gap-4">
										<div>
											<p className="text-sm font-semibold text-[var(--sea-ink)]">
												{house.name}
											</p>
											<p className="text-xs text-[var(--sea-ink-soft)]">
												{house.id}
											</p>
										</div>
										<Badge variant="outline" className="rounded-full">
											{house.apartments.length} apartments
										</Badge>
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
														<CardContent className="px-3">
															<p className="text-sm font-medium text-[var(--sea-ink)]">
																{apartment.name}
															</p>
															<p className="mt-1 text-xs text-[var(--sea-ink-soft)]">
																{apartment.id}
															</p>
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
	);
}
