import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  fileId: text('fileId').notNull(),
  fileType: text('fileType').notNull(),
  ingestionDate: text('ingestionDate').notNull(),
  documentDate: text('documentDate'),
  anchorReference: text('anchorReference'),
});

export const facts = sqliteTable('facts', {
  id: text('id').primaryKey(),
  propertyId: text('propertyId').notNull(),
  category: text('category').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  sourceId: text('sourceId').notNull().references(() => sources.id),
  isGoldStandard: integer('isGoldStandard', { mode: 'boolean' }).notNull(),
  confidenceScore: real('confidenceScore').notNull(),
});
