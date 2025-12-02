import { env } from '@server/lib/env';
import { logger } from '@server/lib/logger';
import { accessToken } from '@server/lib/services/accessToken';
import { KiteConnect, type CompactMargin } from 'kiteconnect-ts';
import PQueue from 'p-queue';

const queue = new PQueue({
  interval: 1000,
  intervalCap: 5,
  carryoverIntervalCount: true,
});

export const kiteService = new KiteConnect({
  api_key: env.KITE_API_KEY,
  access_token: accessToken,
});

const MAX_RETRIES = 3;

const mapTsToMarginOrder = (tradingsymbol: string) => ({
  exchange: 'MCX' as const,
  order_type: 'LIMIT' as const,
  product: 'MIS' as const,
  quantity: 1,
  tradingsymbol,
  transaction_type: 'SELL' as const,
  variety: 'regular' as const,
});

export const getOrderMargins = async (tradingsymbols: string[]) => {
  const allMargins: CompactMargin[] = [];
  let remainingSymbols = tradingsymbols;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (remainingSymbols.length === 0) break;

    try {
      const orders = remainingSymbols.map(mapTsToMarginOrder);
      const margins = await queue.add(() => kiteService.orderMargins(orders, 'compact'));

      const fetchedMargins = margins.filter((margin) => margin.total);
      const failedSymbols = margins.filter((margin) => !margin.total).map((margin) => margin.tradingsymbol);

      allMargins.push(...fetchedMargins);
      remainingSymbols = failedSymbols;

      // if (failedSymbols.length > 0) {
      //   logger.warn(`Attempt ${attempt}/${MAX_RETRIES}: Failed to fetch margins for ${failedSymbols.length} symbols`);
      // }
    } catch (error) {
      logger.error(`Error fetching margins on attempt ${attempt}:`, error);
      if (attempt === MAX_RETRIES) {
        throw error;
      }
    }
  }

  if (remainingSymbols.length > 0) {
    logger.error(
      `Failed to fetch margins for ${remainingSymbols.length} symbols after ${MAX_RETRIES} attempts: ${remainingSymbols.join(', ')}`
    );
  }

  return allMargins;
};
