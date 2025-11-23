CREATE TABLE `instruments` (
	`instrument_token` real PRIMARY KEY NOT NULL,
	`exchange_token` text NOT NULL,
	`tradingsymbol` text NOT NULL,
	`name` text NOT NULL,
	`expiry` text,
	`strike` real,
	`tick_size` real,
	`lot_size` real,
	`instrument_type` text,
	`segment` text,
	`exchange` text
);
