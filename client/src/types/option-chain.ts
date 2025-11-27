export type OptionChain = {
  instrumentToken: number;
  exchangeToken: string;
  tradingsymbol: string;
  name: string;
  expiry: string;
  strike: number | null;
  tickSize: number | null;
  lotSize: number | null;
  instrumentType: 'EQ' | 'FUT' | 'CE' | 'PE' | null;
  segment: string | null;
  exchange: string | null;
  futExpiry: string;
  underlyingLtp: number;
  bid: number;
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
};

export type OptionChainData = Record<number, OptionChain>;

/**
 * Symbol groups for each table within a page
 */
export const SYMBOL_GROUPS = {
  gold: { name: 'Gold', symbols: ['GOLD', 'GOLDM'] },
  goldm: { name: 'Gold Mini', symbols: ['GOLDM'] },
  copper: { name: 'Copper', symbols: ['COPPER'] },
  silver: { name: 'Silver', symbols: ['SILVER', 'SILVERM'] },
  silverm: { name: 'Silver Mini', symbols: ['SILVERM'] },
  zinc: { name: 'Zinc', symbols: ['ZINC'] },
  crudeoil: { name: 'Crude Oil', symbols: ['CRUDEOIL', 'CRUDEOILM'] },
  naturalgas: { name: 'Natural Gas', symbols: ['NATURALGAS', 'NATGASMINI'] },
} as const;

/**
 * Page configurations matching the worker groups for 3-monitor setup
 */
export const PAGE_CONFIGS = [
  {
    id: 'metals',
    name: 'Yellow Metals',
    description: 'Gold and Copper options',
    icon: '🥇',
    path: '/metals',
    tables: [
      { name: 'Gold', symbols: ['GOLD', 'GOLDM'] },
      { name: 'Copper', symbols: ['COPPER'] },
    ],
  },
  {
    id: 'silver',
    name: 'White Metals',
    description: 'Silver and Zinc options',
    icon: '🥈',
    path: '/silver',
    tables: [
      { name: 'Silver', symbols: ['SILVER', 'SILVERM'] },
      { name: 'Zinc', symbols: ['ZINC'] },
    ],
  },
  {
    id: 'energy',
    name: 'Energy',
    description: 'Crude Oil and Natural Gas options',
    icon: '⛽',
    path: '/energy',
    tables: [
      { name: 'Crude Oil', symbols: ['CRUDEOIL', 'CRUDEOILM'] },
      { name: 'Natural Gas', symbols: ['NATURALGAS', 'NATGASMINI'] },
    ],
  },
] as const;
