import { env } from '@server/lib/env';
import { logger } from '@server/lib/logger';
import { accessToken } from '@server/lib/services/accessToken';
import { kiteService } from '@server/lib/services/kite';
import { strikesService } from '@server/lib/services/strikes';
import type { StrikeTokensMap } from '@server/types/types';
import type { WSContext } from 'hono/ws';
import { KiteTicker, type TickFull, type TickLtp } from 'kiteconnect-ts';

type StrikeTokensMapOptional = {
  [K in keyof StrikeTokensMap]: StrikeTokensMap[K] | undefined;
};

class TickerService {
  NIFTY_TOKEN!: number;
  NIFTY_PRICE = 0;
  LOT_SIZE = 75;

  // Order monitoring configuration
  private readonly PRICE_RANGE_OFFSET = 5; // Configurable range offset

  // Order monitoring state
  private entryPrice: number | null = null;
  private ordersEnabled: boolean = false;
  private orderPlaced: boolean = false;

  private ticker = new KiteTicker({
    api_key: env.KITE_API_KEY,
    access_token: accessToken,
  });
  private client: WSContext | null = null;
  private subscribedTokens = new Set<number>();

  private expiry: string | null = null;
  public strikeTokensMap: StrikeTokensMapOptional = {
    ceMinus: undefined,
    cePlus: undefined,
    peMinus: undefined,
    pePlus: undefined,
  };
  private bidAskMap: Record<string, { bid: number; ask: number }> = {};

  private subscribeToTokens(tokens: number[]) {
    for (const token of tokens) {
      if (this.subscribedTokens.has(token)) {
        continue;
      }
      this.subscribedTokens.add(token);
    }
    this.ticker.setMode('full', [...tokens]);
  }

  private unsubscribeFromTokens(tokens?: number[]) {
    tokens = tokens ?? Array.from(this.subscribedTokens);
    for (const token of tokens) {
      this.subscribedTokens.delete(token);
    }
    this.ticker.unsubscribe([...tokens]);
  }

  private calculateSpreads() {
    if (
      !this.strikeTokensMap.ceMinus ||
      !this.strikeTokensMap.cePlus ||
      !this.strikeTokensMap.peMinus ||
      !this.strikeTokensMap.pePlus
    ) {
      return;
    }

    // Put calculations
    const peSpreadWidth = this.strikeTokensMap.pePlus.strike - this.strikeTokensMap.peMinus.strike;

    const pePlusAsk = this.bidAskMap[this.strikeTokensMap.pePlus.token]?.ask || 0;
    const peMinusBid = this.bidAskMap[this.strikeTokensMap.peMinus.token]?.bid || 0;
    const peNetDebit = pePlusAsk - peMinusBid;

    const peMaxProfit = (peSpreadWidth - peNetDebit) * this.LOT_SIZE;
    const peMaxLoss = peNetDebit * this.LOT_SIZE;
    const peBreakEven = this.strikeTokensMap.pePlus.strike - peNetDebit;

    // Call calculations
    const ceSpreadWidth = this.strikeTokensMap.cePlus.strike - this.strikeTokensMap.ceMinus.strike;

    const cePlusAsk = this.bidAskMap[this.strikeTokensMap.cePlus.token]?.ask || 0;
    const ceMinusBid = this.bidAskMap[this.strikeTokensMap.ceMinus.token]?.bid || 0;
    const ceNetCredit = ceMinusBid - cePlusAsk;

    const ceMaxProfit = ceNetCredit * this.LOT_SIZE;
    const ceMaxLoss = (ceSpreadWidth - ceNetCredit) * this.LOT_SIZE;
    const ceBreakEven = this.strikeTokensMap.ceMinus.strike + ceNetCredit;

    return {
      callSpread: {
        maxProfit: ceMaxProfit,
        maxLoss: ceMaxLoss,
        creditOrDebit: ceNetCredit,
        breakEven: ceBreakEven,
      },
      putSpread: {
        maxProfit: peMaxProfit,
        maxLoss: peMaxLoss,
        creditOrDebit: peNetDebit,
        breakEven: peBreakEven,
      },
    };
  }

  async init(niftyToken: number) {
    this.NIFTY_TOKEN = niftyToken;

    logger.info('Connecting to Kite Ticker');
    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Connection timed out'));
      }, 10000);

      this.ticker.on('connect', () => {
        resolve(true);
        clearTimeout(timeoutId);
      });

      this.ticker.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });

      this.ticker.connect();
    });
    logger.info('Connected to Kite Ticker');

    this.ticker.on('ticks', (ticks: (TickLtp | TickFull)[]) => {
      for (const tick of ticks) {
        if (tick.instrument_token === this.NIFTY_TOKEN) {
          this.updateNiftyPrice(tick.last_price);
        } else if (tick.mode === 'full') {
          if (!this.bidAskMap[tick.instrument_token]) {
            this.bidAskMap[tick.instrument_token] = { bid: 0, ask: 0 };
          }
          this.bidAskMap[tick.instrument_token]!.bid = tick.depth?.buy[0]?.price ?? 0;
          this.bidAskMap[tick.instrument_token]!.ask = tick.depth?.sell[0]?.price ?? 0;
        }
      }
    });

    setInterval(() => {
      const spreads = this.calculateSpreads();
      if (spreads && this.client) {
        this.client.send(JSON.stringify({ type: 'spreads', data: spreads }));
      }
    }, 250);
  }

  public subscribeToNifty() {
    this.ticker.setMode('ltp', [this.NIFTY_TOKEN]);
  }

  public updateNiftyPrice(price: number) {
    this.NIFTY_PRICE = price;

    // Check order conditions
    this.checkOrderConditions();

    if (
      this.expiry &&
      this.strikeTokensMap.ceMinus &&
      this.strikeTokensMap.cePlus &&
      (this.NIFTY_PRICE < this.strikeTokensMap.ceMinus.strike || this.NIFTY_PRICE > this.strikeTokensMap.cePlus.strike)
    ) {
      this.subscribe(this.expiry);
    }
  }

  public subscribe(expiry: string) {
    this.expiry = expiry;

    const atm = tickerService.NIFTY_PRICE;
    const map = strikesService.getStrikesForExpiry(expiry, atm);
    this.strikeTokensMap = map;

    this.unsubscribeFromTokens();
    this.subscribeToTokens([map.ceMinus.token, map.cePlus.token, map.peMinus.token, map.pePlus.token]);
  }

  public addClient(client: WSContext) {
    if (this.client) {
      throw new Error('Client already connected');
    }
    this.client = client;
  }

  public removeClient() {
    this.client = null;
  }

  public async disconnect() {
    this.ticker.disconnect();
  }

  // Order monitoring methods
  public setEntryPrice(price: number) {
    this.entryPrice = price;
    logger.info(`Entry price set to: ${price}`);

    // Send order status update to client
    this.sendOrderStatusUpdate();
  }

  public setOrdersEnabled(enabled: boolean) {
    this.ordersEnabled = enabled;

    // Reset order placed flag when enabling orders
    if (enabled) {
      this.orderPlaced = false;
    }

    logger.info(`Orders ${enabled ? 'enabled' : 'disabled'}`);

    // Send order status update to client
    this.sendOrderStatusUpdate();
  }

  private checkOrderConditions() {
    if (!this.ordersEnabled || !this.entryPrice || this.orderPlaced) {
      return;
    }

    const minPrice = this.entryPrice - this.PRICE_RANGE_OFFSET;
    const maxPrice = this.entryPrice + this.PRICE_RANGE_OFFSET;

    if (this.NIFTY_PRICE >= minPrice && this.NIFTY_PRICE <= maxPrice) {
      logger.info(`Nifty price ${this.NIFTY_PRICE} is within range [${minPrice}, ${maxPrice}]. Placing order...`);
      this.placeOrder();
    }
  }

  private async placeOrder() {
    try {
      // Mark order as placed immediately to prevent multiple orders
      this.orderPlaced = true;
      this.ordersEnabled = false; // Turn off monitoring after order placement

      const spreads = this.calculateSpreads();
      if (!spreads) {
        logger.error('No spreads found');
        this.sendOrderStatusUpdate(false, 'No spreads found');
        return;
      }

      const ceMaxLoss = spreads.callSpread.maxLoss;
      const peMaxLoss = spreads.putSpread.maxLoss;
      const prefix = ceMaxLoss < peMaxLoss ? 'ce' : 'pe';

      const minusTradingSymbol = this.strikeTokensMap[`${prefix}Minus`]?.tradingSymbol;
      const plusTradingSymbol = this.strikeTokensMap[`${prefix}Plus`]?.tradingSymbol;

      if (!minusTradingSymbol || !plusTradingSymbol) {
        logger.error('No trading symbols found');
        this.sendOrderStatusUpdate(false, 'No trading symbols found');
        return;
      }

      const orderResponses = await Promise.all([
        kiteService.placeOrder('regular', {
          exchange: 'NFO',
          order_type: 'MARKET',
          product: 'NRML',
          tradingsymbol: minusTradingSymbol,
          transaction_type: 'SELL',
          quantity: this.LOT_SIZE,
        }),
        kiteService.placeOrder('regular', {
          exchange: 'NFO',
          order_type: 'MARKET',
          product: 'NRML',
          tradingsymbol: plusTradingSymbol,
          transaction_type: 'BUY',
          quantity: this.LOT_SIZE,
        }),
      ]);

      logger.info(`Order placed successfully:`, orderResponses);
      this.sendOrderStatusUpdate(true, undefined);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Order placement error: ${errorMessage}`);
      this.sendOrderStatusUpdate(false, errorMessage);
    }
  }

  private sendOrderStatusUpdate(success?: boolean, error?: string) {
    if (!this.client) return;

    const orderStatusData = {
      ordersEnabled: this.ordersEnabled,
      orderPlaced: this.orderPlaced,
      entryPrice: this.entryPrice,
      ...(success !== undefined && { success }),
      ...(error && { error }),
    };

    this.client.send(
      JSON.stringify({
        type: 'order-status',
        data: orderStatusData,
      })
    );
  }
}

export const tickerService = new TickerService();
