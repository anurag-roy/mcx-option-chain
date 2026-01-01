export const CONFIG = {
  // GOLD: { vix: '^GVZ', bidBalance: 0.5, multiplier: 100 },
  // GOLDM: { vix: '^GVZ', bidBalance: 0.5, multiplier: 10 },
  // SILVER: { vix: '^VXSLV', bidBalance: 0.5, multiplier: 30 },
  // SILVERM: { vix: '^VXSLV', bidBalance: 0.5, multiplier: 5 },
  // CRUDEOIL: { vix: '^OVX', bidBalance: 0.05, multiplier: 100 },
  // CRUDEOILM: { vix: '^OVX', bidBalance: 0.05, multiplier: 10 },
  // TODO: Remove these once `yahoo-finance2` issue is fixed: https://github.com/gadicc/yahoo-finance2/issues/977
  GOLD: { vix: 23.95, bidBalance: 0.5, multiplier: 100 },
  GOLDM: { vix: 23.95, bidBalance: 0.5, multiplier: 10 },
  SILVER: { vix: 68.07, bidBalance: 0.5, multiplier: 30 },
  SILVERM: { vix: 68.07, bidBalance: 0.5, multiplier: 5 },
  CRUDEOIL: { vix: 33, bidBalance: 0.05, multiplier: 100 },
  CRUDEOILM: { vix: 33, bidBalance: 0.05, multiplier: 10 },
  NATURALGAS: { vix: 62, bidBalance: 0.05, multiplier: 1250 },
  NATGASMINI: { vix: 62, bidBalance: 0.05, multiplier: 250 },
  COPPER: { vix: 49, bidBalance: 0.01, multiplier: 2500 },
  ZINC: { vix: 25, bidBalance: 0.01, multiplier: 5000 },
};

/**
 * Symbols that have numeric (updatable) VIX values.
 * Other symbols use Yahoo Finance symbol-based VIX which is fetched dynamically.
 */
export const NUMERIC_VIX_SYMBOLS = ['NATURALGAS', 'NATGASMINI', 'COPPER', 'ZINC'] as const;

/**
 * Worker groups for distributing symbols across multiple KiteTicker connections.
 * Each group runs in a separate process to avoid Zerodha's 3000 instrument limit
 * and to distribute tick processing load.
 */
export const WORKER_GROUPS = [
  ['GOLD', 'GOLDM', 'COPPER'],
  ['SILVER', 'SILVERM', 'ZINC'],
  ['CRUDEOIL', 'CRUDEOILM', 'NATURALGAS', 'NATGASMINI'],
] as const;

export type Symbol = keyof typeof CONFIG;
