import { relations } from "drizzle-orm";

import {
	apartments,
	cases,
	factApartments,
	factCases,
	factHouses,
	facts,
	houses,
	properties,
	sources,
	users,
} from "./schema";

export const propertiesRelations = relations(properties, ({ many }) => ({
	houses: many(houses),
	facts: many(facts),
	cases: many(cases),
}));

export const housesRelations = relations(houses, ({ one, many }) => ({
	property: one(properties, {
		fields: [houses.propertyId],
		references: [properties.id],
	}),
	apartments: many(apartments),
	caseRecords: many(cases),
	factLinks: many(factHouses),
}));

export const apartmentsRelations = relations(apartments, ({ one, many }) => ({
	house: one(houses, {
		fields: [apartments.houseId],
		references: [houses.id],
	}),
	caseRecords: many(cases),
	factLinks: many(factApartments),
}));

export const usersRelations = relations(users, ({ many }) => ({
	ownedCases: many(cases),
}));

export const sourcesRelations = relations(sources, ({ many }) => ({
	facts: many(facts),
}));

export const factsRelations = relations(facts, ({ one, many }) => ({
	property: one(properties, {
		fields: [facts.propertyId],
		references: [properties.id],
	}),
	source: one(sources, {
		fields: [facts.sourceId],
		references: [sources.id],
	}),
	houseLinks: many(factHouses),
	apartmentLinks: many(factApartments),
	caseLinks: many(factCases),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
	property: one(properties, {
		fields: [cases.propertyId],
		references: [properties.id],
	}),
	house: one(houses, {
		fields: [cases.houseId],
		references: [houses.id],
	}),
	apartment: one(apartments, {
		fields: [cases.apartmentId],
		references: [apartments.id],
	}),
	owner: one(users, {
		fields: [cases.ownerUserId],
		references: [users.id],
	}),
	factLinks: many(factCases),
}));

export const factHousesRelations = relations(factHouses, ({ one }) => ({
	fact: one(facts, {
		fields: [factHouses.factId],
		references: [facts.id],
	}),
	house: one(houses, {
		fields: [factHouses.houseId],
		references: [houses.id],
	}),
}));

export const factApartmentsRelations = relations(factApartments, ({ one }) => ({
	fact: one(facts, {
		fields: [factApartments.factId],
		references: [facts.id],
	}),
	apartment: one(apartments, {
		fields: [factApartments.apartmentId],
		references: [apartments.id],
	}),
}));

export const factCasesRelations = relations(factCases, ({ one }) => ({
	fact: one(facts, {
		fields: [factCases.factId],
		references: [facts.id],
	}),
	case: one(cases, {
		fields: [factCases.caseId],
		references: [cases.id],
	}),
}));
