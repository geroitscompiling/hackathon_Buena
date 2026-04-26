import { readFile } from "node:fs/promises";

export type ErpUnitRow = {
	hausId: string;
	einheitNr: string;
};

export type ErpStammdatenContext = {
	unitToHaus: Map<string, ErpUnitRow>;
	hausIdToDisplayName: Map<string, string>;
};

type StammdatenJson = {
	einheiten?: Array<{ id: string; haus_id: string; einheit_nr: string }>;
	gebaeude?: Array<{ id: string; hausnr: string }>;
};

export async function loadErpStammdatenContextFromFile(
	absolutePath: string,
): Promise<ErpStammdatenContext | null> {
	try {
		const raw = await readFile(absolutePath, "utf-8");
		const data = JSON.parse(raw) as StammdatenJson;
		const unitToHaus = new Map<string, ErpUnitRow>();
		for (const einheit of data.einheiten ?? []) {
			if (einheit?.id && einheit?.haus_id) {
				unitToHaus.set(einheit.id, {
					hausId: einheit.haus_id,
					einheitNr: einheit.einheit_nr ?? einheit.id,
				});
			}
		}
		const hausIdToDisplayName = new Map<string, string>();
		for (const g of data.gebaeude ?? []) {
			if (g?.id) {
				hausIdToDisplayName.set(g.id, g.hausnr ? `Haus ${g.hausnr}` : g.id);
			}
		}
		return { unitToHaus, hausIdToDisplayName };
	} catch {
		return null;
	}
}
