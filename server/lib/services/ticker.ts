import { db } from '@server/db';
import { instrumentsTable } from '@server/db/schema';
import { env } from '@server/lib/env';
import { logger } from '@server/lib/logger';
import { workingDaysCache } from '@server/lib/market-minutes-cache';
import { accessToken } from '@server/lib/services/accessToken';
import { kiteService } from '@server/lib/services/kite';
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

class TickerService {
  private readonly OPTION_CHAIN_UPDATE_INTERVAL = 250;
  private readonly MARGIN_UPDATE_INTERVAL = 1000;

  private ticker = new KiteTicker({
    api_key: env.KITE_API_KEY,
    access_token: accessToken,
  });
  private client: WSContext | null = null;
  private subscribedTokens = new Set<number>();

  /**
   * token to underlying and expiry
   */
  private futureTokensMap: Record<number, { underlying: string; expiry: string }> = {};
  /**
   * underlying to expiry to ltp
   */
  private futureLtps: Record<string, Record<string, number>> = {};

  private optionChain: Record<number, OptionChain> = {};
  private isFetchingMargins = false;

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
    for (const token of tokens) {
      if (this.subscribedTokens.has(token)) {
        continue;
      }
      this.subscribedTokens.add(token);
    }
    logger.info(`Number of subscribed tokens: ${this.subscribedTokens.size}`);
    if (this.subscribedTokens.size > 3000) {
      console.warn('Subscribed tokens limit reached -', this.subscribedTokens.size);
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
          this.futureLtps[underlying]![expiry] = tick.last_price;
          // TODO: If FUT ltp changes, check if ATM is changed or not
        } else if (tick.mode === 'full') {
          const instrument = this.optionChain[tick.instrument_token];
          if (!instrument) {
            continue;
          }

          instrument.bid = tick.depth?.buy[0]?.price ?? 0;
        }
      }
    });

    this.ticker.setMode(
      'ltp',
      futures.map((f) => f.instrumentToken)
    );

    // Update option chain
    setInterval(() => {
      const options = this.calculateOptions();

      // Publish option chain data via callback (worker mode) or WS client
      if (options.length > 0) {
        if (this.dataCallback) {
          this.dataCallback(options);
        } else if (this.client) {
          this.client.send(JSON.stringify({ type: 'optionChain', data: options }));
        }
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
  }

  private async updateOrderMargins() {
    this.isFetchingMargins = true;
    const options = Object.values(this.optionChain).filter((o) => o.sellValue > o.returnValue);
    if (options.length > 0) {
      const tsToTokenMap: Record<string, number> = {};
      for (const option of options) {
        tsToTokenMap[option.tradingsymbol] = option.instrumentToken;
      }

      const chunks = chunk(
        options.map((o) => o.tradingsymbol),
        200
      );

      for (const tradingsymbols of chunks) {
        const orders = tradingsymbols.map((tradingsymbol) => ({
          exchange: 'MCX' as const,
          order_type: 'LIMIT' as const,
          product: 'MIS' as const,
          quantity: 1,
          tradingsymbol: tradingsymbol,
          transaction_type: 'SELL' as const,
          variety: 'regular' as const,
        }));

        try {
          const margins = await kiteService.orderMargins(orders, 'compact');

          for (const margin of margins) {
            const token = tsToTokenMap[margin.tradingsymbol];
            if (token) {
              this.optionChain[token]!.orderMargin = margin.total;
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

      const { bidBalance, multiplier } = CONFIG[instrument.name as keyof typeof CONFIG];
      instrument.underlyingLtp = this.futureLtps[instrument.name]![instrument.futExpiry]!;
      instrument.strikePosition =
        (Math.abs(instrument.strike! - instrument.underlyingLtp) * 100) / instrument.underlyingLtp;
      if (instrument.bid) {
        instrument.sellValue = (instrument.bid - bidBalance) * instrument.lotSize!;
        if (instrument.orderMargin > 0) {
          instrument.returnValue =
            ((instrument.bid - bidBalance) * instrument.lotSize! * multiplier) / instrument.orderMargin;
        }
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
        av,
        T,
        instrument.instrumentType as 'CE' | 'PE'
      );
    }

    return Object.values(this.optionChain).filter((o) => o.sellValue > o.returnValue);
  }

  public async subscribe(underlying: string, sdMultiplier: number) {
    const distinctOptionExpiries = await db
      .selectDistinct({ expiry: instrumentsTable.expiry })
      .from(instrumentsTable)
      .where(and(eq(instrumentsTable.name, underlying), inArray(instrumentsTable.instrumentType, ['CE', 'PE'])));

    for (const { expiry } of distinctOptionExpiries) {
      const [futExpiry] = Object.keys(this.futureLtps[underlying]!)
        .filter((e) => e > expiry)
        .sort();
      if (!futExpiry) {
        console.error(`No future expiry found for ${underlying} ${expiry}`);
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
          // Calculate sigmas for both CE and PE
          const ceSigmas = workingDaysCache.calculateAllSigmas(av, sdMultiplier, expiry, 'CE');

          // Calculate asymmetric bounds
          // For CE: Ceiling = LTP + (σₓᵢ %)
          ceBound = ltp + (ltp * ceSigmas.sigmaXI) / 100;

          // For PE: Floor = LTP - (σₓᵢ %)
          peBound = ltp - (ltp * ceSigmas.sigmaXI) / 100;

          logger.info(
            `${underlying} ${expiry}: LTP: ${ltp}, AV: ${av}, sdMultiplier: ${sdMultiplier}, minutes in last year: ${workingDaysCache.getMarketMinutesInLastYear()}, minutes till expiry: ${workingDaysCache.getMarketMinutesTillExpiry(expiry)}`
          );
          logger.info(
            `${underlying} ${expiry}: Sigmas: σ=${ceSigmas.sigma.toFixed(3)}, σₙ=${ceSigmas.sigmaN.toFixed(3)}, σₓ=${ceSigmas.sigmaX.toFixed(3)}, σₓᵢ=${ceSigmas.sigmaXI.toFixed(3)}`
          );
          logger.info(
            `${underlying} ${expiry}: CE Bound (ceiling): ${ceBound.toFixed(2)}, PE Bound (floor): ${peBound.toFixed(2)}`
          );
        } catch (error) {
          logger.error(`${underlying} ${expiry}: Error calculating sigmas:`, error);
          // Fallback to LTP if calculation fails
          ceBound = ltp;
          peBound = ltp;
        }
      }

      // New asymmetric sigma-based filtering logic
      // Get all available strikes for PUTs and CALLs
      const options = await db
        .select()
        .from(instrumentsTable)
        .where(
          and(
            eq(instrumentsTable.name, underlying),
            inArray(instrumentsTable.instrumentType, ['CE', 'PE']),
            eq(instrumentsTable.expiry, expiry)
          )
        )
        .orderBy(asc(instrumentsTable.strike));

      const putStrikes = options
        .filter((s) => s.instrumentType === 'PE')
        .map((s) => s.strike!)
        .sort((a, b) => b - a); // Sort descending for PUTs

      const callStrikes = options
        .filter((s) => s.instrumentType === 'CE')
        .map((s) => s.strike!)
        .sort((a, b) => a - b); // Sort ascending for CALLs

      // Find closest floor strike to PE floor bound
      const closestFloorStrike = putStrikes.find((strike) => strike <= peBound);

      // Find closest ceiling strike to CE ceiling bound
      const closestCeilingStrike = callStrikes.find((strike) => strike >= ceBound);

      logger.info(
        `Asymmetric filtering: PE floor=${peBound.toFixed(2)}, CE ceiling=${ceBound.toFixed(2)}, closestFloorStrike=${closestFloorStrike ?? 'N/A'}, closestCeilingStrike=${closestCeilingStrike ?? 'N/A'}`
      );

      // Filter instruments based on asymmetric logic
      const filteredInstruments = options.filter((s) => {
        if (s.instrumentType === 'PE') {
          // Get all PUTs with strikes below (and including) the closest floor strike
          return closestFloorStrike ? s.strike! <= closestFloorStrike! : false;
        } else if (s.instrumentType === 'CE') {
          // Get all CALLs with strikes above (and including) the closest ceiling strike
          return closestCeilingStrike ? s.strike! >= closestCeilingStrike! : false;
        }
        return false;
      });

      logger.info(`Filtered ${filteredInstruments.length} instruments out of ${options.length} total`);

      // this.unsubscribeFromTokens();
      this.subscribeToTokens(filteredInstruments.map((s) => s.instrumentToken));

      for (const instrument of filteredInstruments) {
        this.optionChain[instrument.instrumentToken] = {
          ...instrument,
          futExpiry,
          underlyingLtp: ltp,
          bid: 0,
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
        };
      }
    }
  }

  /**
   * Subscribe to all symbols in the filter (or all symbols if no filter set).
   * Used by workers to subscribe to their assigned symbols.
   */
  public async subscribeAll(sdMultiplier: number) {
    const symbols = this.symbolsFilter ?? (Object.keys(CONFIG) as Symbol[]);
    logger.info(`Subscribing to ${symbols.length} symbols: ${symbols.join(', ')}`);

    for (const symbol of symbols) {
      try {
        await this.subscribe(symbol, sdMultiplier);
      } catch (error) {
        logger.error(`Failed to subscribe to ${symbol}:`, error);
      }
    }
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
}

export const tickerService = new TickerService();
