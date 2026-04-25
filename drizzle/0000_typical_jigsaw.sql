CREATE TABLE `facts` (
	`id` text PRIMARY KEY NOT NULL,
	`propertyId` text NOT NULL,
	`category` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`sourceId` text NOT NULL,
	`isGoldStandard` integer NOT NULL,
	`confidenceScore` real NOT NULL,
	FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`fileId` text NOT NULL,
	`fileType` text NOT NULL,
	`ingestionDate` text NOT NULL,
	`documentDate` text,
	`anchorReference` text
);
