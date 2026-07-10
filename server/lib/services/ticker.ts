import { db } from '@server/db';
import { instrumentsTable } from '@server/db/schema';
import { env } from '@server/lib/env';
import { logger } from '@server/lib/logger';
import { workingDaysCache } from '@server/lib/market-minutes-cache';
import { accessToken } from '@server/lib/services/accessToken';
import { getOrderMargins } from '@server/lib/services/kite';
import { settingsService } from '@server/lib/services/settings';
import { volatilityService } from '@server/lib/services/volatility';
import { calculateDeltas } from '@server/lib/utils/delta';
import { CONFIG, type Symbol } from '@server/shared/config';
import type { OptionChain } from '@shared/types/types';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { chunk } from 'es-toolkit';
import { HTTPException } from 'hono/http-exception';
import type { WSContext } from 'hono/ws';
import { KiteTicker, type TickFull, type TickLtp } from 'kiteconnect-ts';

export type OptionChainCallback = (data: Record<number, OptionChain>) => void;
type Instrument = typeof instrumentsTable.$inferSelect;
type DesiredOption = { instrument: Instrument; futExpiry: string; underlyingLtp: number };
type RangeRefreshReason = 'subscribe' | 'ltp' | 'pending';

interface ClientSubscription {
  ws: WSContext;
  symbols: Set<Symbol>;
}

export class TickerService {
  private readonly OPTION_CHAIN_UPDATE_INTERVAL = 500;
  private readonly MARGIN_UPDATE_INTERVAL = 5000;
  private readonly COMMODITY_CONFIG_REFRESH_INTERVAL = 5000; // 5 seconds
  private readonly RANGE_REFRESH_THROTTLE_MS = 2000;

  private ticker = new KiteTicker({
    api_key: env.KITE_API_KEY,
    access_token: accessToken,
  });
  private clients: Map<string, ClientSubscription> = new Map();
  private subscribedTokens = new Set<number>();
  private subscribedTokensBySymbol = new Map<Symbol, Set<number>>();

  /**
   * token to underlying and expiry
   */
  private futureTokensMap: Record<number, { underlying: string; expiry: string }> = {};
  /**
   * underlying to expiry to ltp
   */
  private futureLtps: Record<string, Record<string, number>> = {};
  private optionInstrumentsBySymbol = new Map<Symbol, Map<string, Instrument[]>>();

  private optionChain: Record<number, OptionChain> = {};
  private isFetchingMargins = false;
  private activeSdMultiplier: number | null = null;
  private rangeRefreshTimers = new Map<Symbol, ReturnType<typeof setTimeout>>();
  private rangeRefreshInFlight = new Set<Symbol>();
  private pendingRangeRefresh = new Set<Symbol>();

  /**
   * Cached commodity config values (bidBalance, multiplier) for each symbol.
   * Refreshed periodically to pick up settings changes.
   */
  private commodityConfigCache: Record<string, { bidBalance: number; multiplier: number }> = {};

  /**
   * Optional callback for publishing option chain data (used in worker mode)
   */
  private dataCallback: OptionChainCallback | null = null;

  /**
   * Optional filter for symbols this instance should handle
   */
  private symbolsFilter: Symbol[] | null = null;

  /**
   * Set the symbols this ticker instance should handle.
   * If not set, all symbols from CONFIG are handled.
   */
  public setSymbolsFilter(symbols: Symbol[]) {
    this.symbolsFilter = symbols;
    logger.info(`Ticker will handle symbols: ${symbols.join(', ')}`);
  }

  /**
   * Set a callback for publishing option chain data.
   * When set, this callback is called instead of sending to WS client.
   */
  public setDataCallback(callback: OptionChainCallback) {
    this.dataCallback = callback;
  }

  private subscribeToTokens(tokens: number[]) {
    const tokensToSubscribe = tokens.filter((token) => !this.subscribedTokens.has(token));
    if (tokensToSubscribe.length === 0) {
      return [];
    }

    for (const token of tokensToSubscribe) {
      this.subscribedTokens.add(token);
    }

    if (this.subscribedTokens.size > 3000) {
      logger.warn('Subscribed tokens limit reached -', this.subscribedTokens.size);
    }
    this.ticker.subscribe(tokensToSubscribe);
    this.ticker.setMode(this.ticker.modeFull, tokensToSubscribe);

    return tokensToSubscribe;
  }

  private unsubscribeFromTokens(tokens?: number[]) {
    const tokensToUnsubscribe = (tokens ?? Array.from(this.subscribedTokens)).filter((token) =>
      this.subscribedTokens.has(token)
    );
    if (tokensToUnsubscribe.length === 0) {
      return [];
    }

    for (const token of tokensToUnsubscribe) {
      this.subscribedTokens.delete(token);
    }
    this.ticker.unsubscribe(tokensToUnsubscribe);

    return tokensToUnsubscribe;
  }

  private async loadOptionInstrumentsCache() {
    logger.info('Loading option instruments cache');
    const optionsQuery = db
      .select()
      .from(instrumentsTable)
      .where(inArray(instrumentsTable.instrumentType, ['CE', 'PE']))
      .orderBy(asc(instrumentsTable.name), asc(instrumentsTable.expiry), asc(instrumentsTable.strike));

    const options = this.symbolsFilter
      ? (await optionsQuery).filter((option) => this.symbolsFilter!.includes(option.name as Symbol))
      : await optionsQuery;

    this.optionInstrumentsBySymbol.clear();

    for (const option of options) {
      const symbol = option.name as Symbol;
      let expiries = this.optionInstrumentsBySymbol.get(symbol);
      if (!expiries) {
        expiries = new Map<string, Instrument[]>();
        this.optionInstrumentsBySymbol.set(symbol, expiries);
      }

      const instruments = expiries.get(option.expiry) ?? [];
      instruments.push(option);
      expiries.set(option.expiry, instruments);
    }

    logger.info(`Loaded ${options.length} option instruments into cache`);
  }

  private createOptionChainEntry(instrument: Instrument, futExpiry: string, underlyingLtp: number): OptionChain {
    return {
      ...instrument,
      futExpiry,
      underlyingLtp,
      bid: 0,
      marketDepth: null,
      sellValue: 0,
      strikePosition: 0,
      orderMargin: 0,
      returnValue: 0,
      sd: 0,
      sigmaN: 0,
      sigmaX: 0,
      sigmaXI: 0,
      delta: 0,
      av: 0,
      dv: 0,
      addedValue: 0,
    };
  }

  private calculateDesiredOptionsForSymbol(underlying: Symbol, sdMultiplier: number) {
    const expiries = this.optionInstrumentsBySymbol.get(underlying);
    if (!expiries) {
      throw new Error(`No option instruments loaded for ${underlying}`);
    }

    const desiredOptions = new Map<number, DesiredOption>();

    for (const [expiry, options] of expiries.entries()) {
      const [futExpiry] = Object.keys(this.futureLtps[underlying] ?? {})
        .filter((e) => e > expiry)
        .sort();
      if (!futExpiry) {
        logger.error(`No future expiry found for ${underlying} ${expiry}`);
        continue;
      }

      const ltp = this.futureLtps[underlying]?.[futExpiry];
      if (!ltp) {
        throw new HTTPException(400, { message: `LTP not found for ${underlying} ${expiry}` });
      }

      let ceBound = ltp;
      let peBound = ltp;

      const av = volatilityService.values[underlying]?.av;
      if (av) {
        try {
          const ceSigmas = workingDaysCache.calculateAllSigmas(av, sdMultiplier, expiry, 'CE');

          ceBound = ltp + (ltp * ceSigmas.sigmaXI) / 100;
          peBound = ltp - (ltp * ceSigmas.sigmaXI) / 100;
        } catch (error) {
          logger.error(`${underlying} ${expiry}: Error calculating sigmas:`, error);
        }
      }

      const putStrikes = options
        .filter((s) => s.instrumentType === 'PE')
        .map((s) => s.strike!)
        .sort((a, b) => b - a);

      const callStrikes = options
        .filter((s) => s.instrumentType === 'CE')
        .map((s) => s.strike!)
        .sort((a, b) => a - b);

      const closestFloorStrike = putStrikes.find((strike) => strike <= peBound);
      const closestCeilingStrike = callStrikes.find((strike) => strike >= ceBound);

      const filteredInstruments = options.filter((s) => {
        if (s.instrumentType === 'PE') {
          return closestFloorStrike !== undefined ? s.strike! <= closestFloorStrike : false;
        } else if (s.instrumentType === 'CE') {
          return closestCeilingStrike !== undefined ? s.strike! >= closestCeilingStrike : false;
        }
        return false;
      });

      for (const instrument of filteredInstruments) {
        desiredOptions.set(instrument.instrumentToken, { instrument, futExpiry, underlyingLtp: ltp });
      }
    }

    return desiredOptions;
  }

  private applyDesiredOptionsForSymbol(
    underlying: Symbol,
    desiredOptions: Map<number, DesiredOption>,
    reason: RangeRefreshReason
  ) {
    const previousTokens = this.subscribedTokensBySymbol.get(underlying) ?? new Set<number>();
    const desiredTokens = new Set(desiredOptions.keys());
    const tokensToUnsubscribe = Array.from(previousTokens).filter((token) => !desiredTokens.has(token));
    const tokensToSubscribe = Array.from(desiredTokens).filter((token) => !previousTokens.has(token));

    for (const token of tokensToUnsubscribe) {
      delete this.optionChain[token];
    }
    this.unsubscribeFromTokens(tokensToUnsubscribe);

    for (const [token, desired] of desiredOptions.entries()) {
      const existingOption = this.optionChain[token];
      if (existingOption) {
        existingOption.futExpiry = desired.futExpiry;
        existingOption.underlyingLtp = desired.underlyingLtp;
      } else {
        this.optionChain[token] = this.createOptionChainEntry(
          desired.instrument,
          desired.futExpiry,
          desired.underlyingLtp
        );
      }
    }

    this.subscribeToTokens(tokensToSubscribe);
    this.subscribedTokensBySymbol.set(underlying, desiredTokens);

    if (tokensToSubscribe.length > 0 || tokensToUnsubscribe.length > 0) {
      logger.info(
        `${underlying} range refresh (${reason}): +${tokensToSubscribe.length}, -${tokensToUnsubscribe.length}, total ${desiredTokens.size}`
      );
    }
  }

  private refreshSymbolRange(underlying: Symbol, sdMultiplier: number, reason: RangeRefreshReason) {
    if (this.rangeRefreshInFlight.has(underlying)) {
      this.pendingRangeRefresh.add(underlying);
      return;
    }

    this.rangeRefreshInFlight.add(underlying);

    try {
      const desiredOptions = this.calculateDesiredOptionsForSymbol(underlying, sdMultiplier);
      this.applyDesiredOptionsForSymbol(underlying, desiredOptions, reason);
    } catch (error) {
      logger.error(`Failed to refresh option range for ${underlying}:`, error);
    } finally {
      this.rangeRefreshInFlight.delete(underlying);
    }

    if (this.pendingRangeRefresh.delete(underlying) && this.activeSdMultiplier !== null) {
      this.refreshSymbolRange(underlying, this.activeSdMultiplier, 'pending');
    }
  }

  private scheduleRangeRefresh(underlying: Symbol) {
    if (this.activeSdMultiplier === null || this.rangeRefreshTimers.has(underlying)) {
      return;
    }

    const timeout = setTimeout(() => {
      this.rangeRefreshTimers.delete(underlying);

      if (this.activeSdMultiplier !== null) {
        this.refreshSymbolRange(underlying, this.activeSdMultiplier, 'ltp');
      }
    }, this.RANGE_REFRESH_THROTTLE_MS);

    this.rangeRefreshTimers.set(underlying, timeout);
  }

  async init() {
    logger.info('Loading futures data');
    let futuresQuery = db
      .select()
      .from(instrumentsTable)
      .where(and(eq(instrumentsTable.instrumentType, 'FUT'), isNotNull(instrumentsTable.expiry)));

    // If symbols filter is set, only load futures for those symbols
    const futures = this.symbolsFilter
      ? (await futuresQuery).filter((f) => this.symbolsFilter!.includes(f.name as Symbol))
      : await futuresQuery;

    for (const future of futures) {
      this.futureTokensMap[future.instrumentToken] = { underlying: future.name, expiry: future.expiry };
      if (!this.futureLtps[future.name]) {
        this.futureLtps[future.name] = {};
      }
      this.futureLtps[future.name]![future.expiry] = 0;
    }
    logger.info(`Loaded futures data for ${futures.length} instruments`);

    await this.loadOptionInstrumentsCache();

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
        if (tick.instrument_token in this.futureTokensMap) {
          const { underlying, expiry } = this.futureTokensMap[tick.instrument_token]!;
          const previousLtp = this.futureLtps[underlying]![expiry];
          this.futureLtps[underlying]![expiry] = tick.last_price;
          if (previousLtp !== tick.last_price) {
            this.scheduleRangeRefresh(underlying as Symbol);
          }
        } else if (tick.mode === 'full') {
          const instrument = this.optionChain[tick.instrument_token];
          if (!instrument) {
            continue;
          }

          instrument.bid = tick.depth?.buy[0]?.price ?? 0;
          instrument.marketDepth = tick.depth;
        }
      }
    });

    const futureTokens = futures.map((f) => f.instrumentToken);
    this.ticker.subscribe(futureTokens);
    this.ticker.setMode(this.ticker.modeLTP, futureTokens);

    // Update option chain
    setInterval(() => {
      const optionsArray = this.calculateOptions();

      // Publish option chain data via callback (worker mode) or WS clients
      // Always send data, even if empty, to allow UI to clear when no options match
      if (this.dataCallback) {
        // Worker mode: send all data via callback
        const optionsMap: Record<number, OptionChain> = {};
        for (const option of optionsArray) {
          optionsMap[option.instrumentToken] = option;
        }
        this.dataCallback(optionsMap);
      } else {
        // WebSocket mode: send filtered data to each client based on subscriptions
        this.sendToClients(optionsArray);
      }

      // import { json2csv } from 'json-2-csv';
      // import { writeFileSync } from 'node:fs';
      // import { join } from 'node:path';
      // const csv = json2csv(options.sort((a, b) => a.strike! - b.strike!));
      // writeFileSync(join('.data', 'option-chain.csv'), csv);
    }, this.OPTION_CHAIN_UPDATE_INTERVAL);

    // Update order margins
    setInterval(() => {
      if (this.isFetchingMargins) {
        return;
      }
      this.updateOrderMargins().catch((error) => {
        logger.error('Error updating order margins:', error);
      });
    }, this.MARGIN_UPDATE_INTERVAL);

    // Initialize and periodically refresh commodity config cache
    await this.refreshCommodityConfigCache();
    setInterval(() => {
      this.refreshCommodityConfigCache().catch((error) => {
        logger.error('Error refreshing commodity config cache:', error);
      });
    }, this.COMMODITY_CONFIG_REFRESH_INTERVAL);
  }

  /**
   * Refresh the cached commodity config values from settings service.
   */
  private async refreshCommodityConfigCache() {
    const symbols = this.symbolsFilter ?? (Object.keys(CONFIG) as Symbol[]);

    for (const symbol of symbols) {
      const bidBalance = await settingsService.getBidBalance(symbol);
      const multiplier = await settingsService.getMultiplier(symbol);
      this.commodityConfigCache[symbol] = { bidBalance, multiplier };
    }
  }

  private async updateOrderMargins() {
    this.isFetchingMargins = true;
    const options = Object.values(this.optionChain);
    if (options.length > 0) {
      const tsToTokenMap: Record<string, number> = {};
      for (const option of options) {
        tsToTokenMap[option.tradingsymbol] = option.instrumentToken;
      }

      const chunks = chunk(
        options.map((o) => o.tradingsymbol),
        400
      );

      for (const tradingSymbols of chunks) {
        try {
          const margins = await getOrderMargins(tradingSymbols);

          for (const margin of margins) {
            const token = tsToTokenMap[margin.tradingsymbol];
            if (token) {
              const foundOption = this.optionChain[token];
              if (foundOption) {
                foundOption.orderMargin = margin.total;
              } else {
                logger.error(`Option not found for ${margin.tradingsymbol}`);
              }
            } else {
              logger.error(`Token not found for ${margin.tradingsymbol}`);
            }
          }
        } catch (error) {
          logger.error(`Error fetching margins for chunk:`, error);
        }
      }
    }

    this.isFetchingMargins = false;
  }

  private calculateOptions() {
    for (const instrument of Object.values(this.optionChain)) {
      const av = volatilityService.values[instrument.name]?.av;
      if (!av) {
        continue;
      }
      instrument.av = av;
      // If av exists, dv should also exist
      instrument.dv = volatilityService.values[instrument.name]?.dv!;

      // Use cached commodity config values (refreshed from settings service)
      const commodityConfig =
        this.commodityConfigCache[instrument.name] ?? CONFIG[instrument.name as keyof typeof CONFIG];
      const { bidBalance, multiplier } = commodityConfig;
      instrument.underlyingLtp = this.futureLtps[instrument.name]![instrument.futExpiry]!;
      instrument.strikePosition =
        (Math.abs(instrument.strike! - instrument.underlyingLtp) * 100) / instrument.underlyingLtp;
      if (instrument.bid) {
        instrument.sellValue = (instrument.bid - bidBalance) * instrument.lotSize! * multiplier;
        if (instrument.orderMargin > 0) {
          instrument.returnValue = instrument.sellValue / instrument.orderMargin;
        }
      } else {
        instrument.bid = 0;
        instrument.sellValue = 0;
        instrument.returnValue = 0;
      }

      instrument.sd = workingDaysCache.calculateSD(av, instrument.expiry);

      // Calculate new sigma values
      const sigmas = workingDaysCache.calculateAllSigmas(
        av,
        1, // Use base multiplier of 1 for individual instruments (multiplier applied at bounds level)
        instrument.expiry,
        instrument.instrumentType as 'CE' | 'PE'
      );

      instrument.sigmaN = sigmas.sigmaN;
      instrument.sigmaX = sigmas.sigmaX;
      instrument.sigmaXI = sigmas.sigmaXI;

      // Calculate delta using Black-Scholes (fresh calculation every time)
      const marketMinutesTillExpiry = workingDaysCache.getMarketMinutesTillExpiry(instrument.expiry);
      const marketMinutesInLastYear = workingDaysCache.getMarketMinutesInLastYear();
      const T = marketMinutesTillExpiry / marketMinutesInLastYear;

      instrument.delta = calculateDeltas(
        instrument.underlyingLtp,
        instrument.strike!,
        av / 100,
        T,
        instrument.instrumentType as 'CE' | 'PE'
      );

      // Calculate addedValue (Return Value / |Delta|)
      if (instrument.delta !== 0 && instrument.returnValue) {
        instrument.addedValue = instrument.returnValue / Math.abs(instrument.delta);
      } else {
        instrument.addedValue = 0;
      }
    }

    return Object.values(this.optionChain).filter((o) => o.sellValue > o.returnValue);
  }

  public async subscribe(underlying: string, sdMultiplier: number) {
    this.refreshSymbolRange(underlying as Symbol, sdMultiplier, 'subscribe');
  }

  /**
   * Subscribe to all symbols in the filter (or all symbols if no filter set).
   * Used by workers to subscribe to their assigned symbols.
   *
   * When called with a new sdMultiplier, this will:
   * 1. Calculate new bounds based on the new multiplier
   * 2. Unsubscribe from tokens that are no longer in range
   * 3. Subscribe to new tokens that are now in range
   */
  public async subscribeAll(sdMultiplier: number) {
    const symbols = this.symbolsFilter ?? (Object.keys(CONFIG) as Symbol[]);
    logger.info(`Subscribing to ${symbols.length} symbols with sdMultiplier: ${sdMultiplier}`);
    const oldTokenCount = this.subscribedTokens.size;
    this.activeSdMultiplier = sdMultiplier;

    for (const symbol of symbols) {
      this.refreshSymbolRange(symbol, sdMultiplier, 'subscribe');
    }

    logger.info(`Total subscribed option tokens: ${this.subscribedTokens.size} (was ${oldTokenCount})`);
  }

  /**
   * Send option chain updates to all connected clients based on their subscriptions
   */
  private sendToClients(options: OptionChain[]) {
    for (const [clientId, subscription] of this.clients.entries()) {
      try {
        // Filter options based on client's subscribed symbols
        const filteredOptions: Record<number, OptionChain> = {};
        for (const option of options) {
          if (subscription.symbols.has(option.name as Symbol)) {
            filteredOptions[option.instrumentToken] = option;
          }
        }

        // Only send if there's data for this client
        if (Object.keys(filteredOptions).length > 0) {
          subscription.ws.send(JSON.stringify({ type: 'optionChain', data: filteredOptions }));
        }
      } catch (error) {
        logger.error(`Error sending to client ${clientId}:`, error);
        // Remove dead client
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Add a new WebSocket client
   */
  public addClient(clientId: string, client: WSContext) {
    this.clients.set(clientId, {
      ws: client,
      symbols: new Set(),
    });
    logger.info(`Client ${clientId} connected. Total clients: ${this.clients.size}`);
  }

  /**
   * Remove a WebSocket client
   */
  public removeClient(clientId: string) {
    this.clients.delete(clientId);
    logger.info(`Client ${clientId} disconnected. Total clients: ${this.clients.size}`);
  }

  /**
   * Subscribe a client to specific symbols
   */
  public subscribeClient(clientId: string, symbols: Symbol[]) {
    const subscription = this.clients.get(clientId);
    if (!subscription) {
      logger.warn(`Cannot subscribe: client ${clientId} not found`);
      return;
    }

    // Add symbols to subscription
    for (const symbol of symbols) {
      subscription.symbols.add(symbol);
    }

    logger.info(`Client ${clientId} subscribed to: ${symbols.join(', ')}`);

    // Send initial data for subscribed symbols
    this.sendInitialData(clientId);
  }

  /**
   * Unsubscribe a client from specific symbols
   */
  public unsubscribeClient(clientId: string, symbols: Symbol[]) {
    const subscription = this.clients.get(clientId);
    if (!subscription) {
      return;
    }

    for (const symbol of symbols) {
      subscription.symbols.delete(symbol);
    }

    logger.info(`Client ${clientId} unsubscribed from: ${symbols.join(', ')}`);
  }

  /**
   * Send initial option chain snapshot to a client
   */
  private sendInitialData(clientId: string) {
    const subscription = this.clients.get(clientId);
    if (!subscription) {
      return;
    }

    // Filter option chain based on client's subscribed symbols
    const filteredOptions: Record<number, OptionChain> = {};
    for (const [token, option] of Object.entries(this.optionChain)) {
      if (subscription.symbols.has(option.name as Symbol)) {
        filteredOptions[Number(token)] = option;
      }
    }

    // Send initial data
    if (Object.keys(filteredOptions).length > 0) {
      try {
        subscription.ws.send(JSON.stringify({ type: 'optionChain', data: filteredOptions }));
        logger.info(`Sent initial data to client ${clientId}: ${Object.keys(filteredOptions).length} instruments`);
      } catch (error) {
        logger.error(`Error sending initial data to client ${clientId}:`, error);
      }
    }
  }

  public async disconnect() {
    for (const timer of this.rangeRefreshTimers.values()) {
      clearTimeout(timer);
    }
    this.rangeRefreshTimers.clear();
    this.ticker.disconnect();
  }
}
