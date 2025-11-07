import { real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Exchange } from 'kiteconnect-ts';

export const instruments = sqliteTable('instruments', {
  instrumentToken: real().primaryKey().notNull(),
  exchangeToken: text().notNull(),
  tradingsymbol: text().notNull(),
  name: text().notNull(),
  expiry: text(),
  strike: real(),
  tickSize: real(),
  lotSize: real(),
  instrumentType: text().$type<'EQ' | 'FUT' | 'CE' | 'PE'>(),
  segment: text(),
  exchange: text().$type<Exchange>(),
});
