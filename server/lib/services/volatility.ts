import { logger } from '@server/lib/logger';
import { workingDaysCache } from '@server/lib/market-minutes-cache';
import { settingsService } from '@server/lib/services/settings';
import { setIntervalNow } from '@server/lib/utils';
import { CONFIG, NUMERIC_VIX_SYMBOLS, type Symbol } from '@server/shared/config';
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
      const isNumericVix = NUMERIC_VIX_SYMBOLS.includes(symbol as (typeof NUMERIC_VIX_SYMBOLS)[number]);

      // Create the getAv function based on whether VIX is numeric or a Yahoo Finance symbol
      const getAv = isNumericVix
        ? // For numeric VIX: read from settings service (allows dynamic updates)
          async () => {
            const vix = await settingsService.getVix(symbol);
            return vix as number;
          }
        : // For symbol-based VIX: fetch from Yahoo Finance
          () => getPrice(CONFIG[symbol].vix as string);

      setIntervalNow(async () => {
        try {
          const av = await getAv();
          const dv = workingDaysCache.getDvFromAv(av);
          this.values[symbol] = { av, dv };
        } catch (error) {
          logger.error(`Error fetching volatility for ${symbol}:`, error);
        }
      }, 1000 * 60); // 1 minute
    }
    logger.info('Volatility service initialized');
  }
}

export const volatilityService = new VolatilityService();
