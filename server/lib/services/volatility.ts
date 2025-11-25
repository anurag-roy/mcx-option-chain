import { logger } from '@server/lib/logger';
import { workingDaysCache } from '@server/lib/market-minutes-cache';
import { setIntervalNow } from '@server/lib/utils';
import { CONFIG } from '@server/shared/config';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const getPrice = (symbol: string) =>
  yahooFinance.quoteCombine(symbol, { fields: ['regularMarketPrice'] }).then((data) => data.regularMarketPrice);

class VolatilityService {
  values: Record<string, { av: number; dv: number }> = {};

  async init() {
    logger.info('Initializing volatility service');
    for (const [symbol, { vix }] of Object.entries(CONFIG)) {
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
