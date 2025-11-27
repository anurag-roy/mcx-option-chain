import { logger } from '@server/lib/logger';
import { workingDaysCache } from '@server/lib/market-minutes-cache';
import { setIntervalNow } from '@server/lib/utils';
import { CONFIG, type Symbol } from '@server/shared/config';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const getPrice = (symbol: string) =>
  yahooFinance.quoteCombine(symbol, { fields: ['regularMarketPrice'] }).then((data) => data.regularMarketPrice);

class VolatilityService {
  values: Record<string, { av: number; dv: number }> = {};

  /**
   * Optional filter for symbols this instance should handle
   */
  private symbolsFilter: Symbol[] | null = null;

  /**
   * Set the symbols this volatility service should handle.
   * If not set, all symbols from CONFIG are handled.
   */
  public setSymbolsFilter(symbols: Symbol[]) {
    this.symbolsFilter = symbols;
  }

  async init() {
    const symbols = this.symbolsFilter ?? (Object.keys(CONFIG) as Symbol[]);
    logger.info(`Initializing volatility service for ${symbols.length} symbols`);

    for (const symbol of symbols) {
      const { vix } = CONFIG[symbol];
      const getAv = typeof vix === 'number' ? () => vix : () => getPrice(vix);

      setIntervalNow(async () => {
        const av = await getAv();
        const dv = workingDaysCache.getDvFromAv(av);
        this.values[symbol] = { av, dv };
      }, 1000 * 60); // 1 minute
    }
    logger.info('Volatility service initialized');
  }
}

export const volatilityService = new VolatilityService();
