export type StrikeTokensMap = Record<
  'ceMinus' | 'cePlus' | 'peMinus' | 'pePlus',
  { strike: number; token: number; tradingSymbol: string }
>;
