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
  private revisions = new Map<Symbol, number>();
  private updateCallback: ((symbol: Symbol) => void) | null = null;

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

  public setUpdateCallback(callback: (symbol: Symbol) => void) {
    this.updateCallback = callback;
  }

  private setValue(symbol: Symbol, av: number) {
    const dv = workingDaysCache.getDvFromAv(av);
    const previous = this.values[symbol];
    this.values[symbol] = { av, dv };
    if (previous?.av !== av || previous?.dv !== dv) {
      this.updateCallback?.(symbol);
    }
  }

  public updateVix(symbol: Symbol, value: number) {
    if (!NUMERIC_VIX_SYMBOLS.some((numericSymbol) => numericSymbol === symbol)) {
      throw new Error(`VIX is not updatable for ${symbol}`);
    }
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('VIX must be a finite positive number');
    }

    // Discard any database read that started before this live update.
    this.revisions.set(symbol, (this.revisions.get(symbol) ?? 0) + 1);
    this.setValue(symbol, value);
  }

  private async refresh(symbol: Symbol) {
    const revision = this.revisions.get(symbol) ?? 0;
    try {
      const av = NUMERIC_VIX_SYMBOLS.some((numericSymbol) => numericSymbol === symbol)
        ? ((await settingsService.getVix(symbol)) as number)
        : await getPrice(CONFIG[symbol].vix as string);

      if ((this.revisions.get(symbol) ?? 0) === revision) {
        this.setValue(symbol, av);
      }
    } catch (error) {
      logger.error(`Error fetching volatility for ${symbol}:`, error);
    }
  }

  async init() {
    const symbols = this.symbolsFilter ?? (Object.keys(CONFIG) as Symbol[]);
    logger.info(`Initializing volatility service for ${symbols.length} symbols`);

    await Promise.all(symbols.map((symbol) => setIntervalNow(() => this.refresh(symbol), 2 * 1000 * 60)));
    logger.info('Volatility service initialized');
  }
}

export const volatilityService = new VolatilityService();
