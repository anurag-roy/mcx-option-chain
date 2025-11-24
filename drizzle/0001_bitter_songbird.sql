PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_instruments` (
	`instrument_token` real PRIMARY KEY NOT NULL,
	`exchange_token` text NOT NULL,
	`tradingsymbol` text NOT NULL,
	`name` text NOT NULL,
	`expiry` text NOT NULL,
	`strike` real,
	`tick_size` real,
	`lot_size` real,
	`instrument_type` text,
	`segment` text,
	`exchange` text
);
--> statement-breakpoint
INSERT INTO `__new_instruments`("instrument_token", "exchange_token", "tradingsymbol", "name", "expiry", "strike", "tick_size", "lot_size", "instrument_type", "segment", "exchange") SELECT "instrument_token", "exchange_token", "tradingsymbol", "name", "expiry", "strike", "tick_size", "lot_size", "instrument_type", "segment", "exchange" FROM `instruments`;--> statement-breakpoint
DROP TABLE `instruments`;--> statement-breakpoint
ALTER TABLE `__new_instruments` RENAME TO `instruments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `name_idx` ON `instruments` (`name`);--> statement-breakpoint
CREATE INDEX `expiry_idx` ON `instruments` (`expiry`);