import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Exchange } from 'kiteconnect-ts';

export const instrumentsTable = sqliteTable(
  'instruments',
  {
    instrumentToken: real().primaryKey().notNull(),
    exchangeToken: text().notNull(),
    tradingsymbol: text().notNull(),
    name: text().notNull(),
    expiry: text().notNull(),
    strike: real(),
    tickSize: real(),
    lotSize: real(),
    instrumentType: text().$type<'EQ' | 'FUT' | 'CE' | 'PE'>(),
    segment: text(),
    exchange: text().$type<Exchange>(),
  },
  (table) => [index('name_idx').on(table.name), index('expiry_idx').on(table.expiry)]
);

export type HolidayType = 'morning' | 'evening' | 'full';

export const holidaysTable = sqliteTable(
  'holidays',
  {
    date: text().primaryKey(),
    name: text().notNull(),
    type: text().$type<HolidayType>().notNull(),
    year: real().notNull(),
    month: real().notNull(),
    day: real().notNull(),
  },
  (table) => [
    index('holidays_year_idx').on(table.year),
    index('holidays_month_idx').on(table.month),
    index('holidays_year_month_idx').on(table.year, table.month),
  ]
);
