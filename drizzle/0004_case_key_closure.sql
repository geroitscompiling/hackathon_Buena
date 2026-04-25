ALTER TABLE `cases` ADD `caseKey` text DEFAULT '';
--> statement-breakpoint
UPDATE `cases` SET `caseKey` = 'migrated-' || `id` WHERE `caseKey` IS NULL OR `caseKey` = '';
--> statement-breakpoint
ALTER TABLE `cases` ADD `closurePredicate` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `cases_property_case_key` ON `cases` (`propertyId`,`caseKey`);
