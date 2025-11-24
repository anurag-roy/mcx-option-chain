import type { instrumentsTable } from '@server/db/schema';

type Instrument = typeof instrumentsTable.$inferSelect;
export type OptionChain = Instrument & {
  /**
   * LTP of the corresponding FUT
   */
  underlyingLtp: number;
  bid: number;
  sellValue: number;
  strikePosition: number;
  returnValue: number;
  sd: number;
  sigmaN: number;
  sigmaX: number;
  sigmaXI: number;
  delta: number;
  av: number;
  dv: number;
};
