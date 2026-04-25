CREATE TABLE `apartments` (
	`id` text PRIMARY KEY NOT NULL,
	`houseId` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`houseId`) REFERENCES `houses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`propertyId` text NOT NULL,
	`houseId` text,
	`apartmentId` text,
	`ownerUserId` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`status` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`houseId`) REFERENCES `houses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`apartmentId`) REFERENCES `apartments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ownerUserId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fact_apartments` (
	`factId` text NOT NULL,
	`apartmentId` text NOT NULL,
	PRIMARY KEY(`factId`, `apartmentId`),
	FOREIGN KEY (`factId`) REFERENCES `facts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`apartmentId`) REFERENCES `apartments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fact_cases` (
	`factId` text NOT NULL,
	`caseId` text NOT NULL,
	PRIMARY KEY(`factId`, `caseId`),
	FOREIGN KEY (`factId`) REFERENCES `facts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`caseId`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fact_houses` (
	`factId` text NOT NULL,
	`houseId` text NOT NULL,
	PRIMARY KEY(`factId`, `houseId`),
	FOREIGN KEY (`factId`) REFERENCES `facts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`houseId`) REFERENCES `houses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `houses` (
	`id` text PRIMARY KEY NOT NULL,
	`propertyId` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`propertyId` text NOT NULL,
	`category` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`sourceId` text NOT NULL,
	`isGoldStandard` integer NOT NULL,
	`confidenceScore` real NOT NULL,
	FOREIGN KEY (`propertyId`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_facts`("id", "propertyId", "category", "key", "value", "sourceId", "isGoldStandard", "confidenceScore") SELECT "id", "propertyId", "category", "key", "value", "sourceId", "isGoldStandard", "confidenceScore" FROM `facts`;--> statement-breakpoint
DROP TABLE `facts`;--> statement-breakpoint
ALTER TABLE `__new_facts` RENAME TO `facts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;