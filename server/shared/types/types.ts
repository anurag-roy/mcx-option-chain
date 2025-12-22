import type { instrumentsTable } from '@server/db/schema';
import type { TickFull } from 'kiteconnect-ts';

type Instrument = typeof instrumentsTable.$inferSelect;
export type OptionChain = Instrument & {
  /**
   * Expiry of the corresponding FUT
   */
  futExpiry: string;
  /**
   * LTP of the FUT
   */
  underlyingLtp: number;
  bid: number;
  marketDepth: TickFull['depth'] | null;
  sellValue: number;
  strikePosition: number;
  orderMargin: number;
  returnValue: number;
  sd: number;
  sigmaN: number;
  sigmaX: number;
  sigmaXI: number;
  delta: number;
  av: number;
  dv: number;
  addedValue: number;
};
