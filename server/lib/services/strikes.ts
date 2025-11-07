import { db } from '@server/db';
import { instruments } from '@server/db/schema';
import { logger } from '@server/lib/logger';
import type { StrikeTokensMap } from '@server/types/types';
import { inArray } from 'drizzle-orm';
import { sortBy } from 'es-toolkit';

type ExpiryToStrikesMap = Record<
  string,
  {
    ce: { strike: number; token: number; tradingSymbol: string }[];
    pe: { strike: number; token: number; tradingSymbol: string }[];
  }
>;

class StrikesService {
  private expiryToStrikesMap: ExpiryToStrikesMap = {};

  async init() {
    logger.info('Initializing expiries and strikes');
    const allOptions = await db
      .select()
      .from(instruments)
      .where(inArray(instruments.instrumentType, ['CE', 'PE']));

    for (const option of allOptions) {
      const expiry = option.expiry;
      if (!expiry) continue;

      if (!this.expiryToStrikesMap[expiry]) {
        this.expiryToStrikesMap[expiry] = { ce: [], pe: [] };
      }
      if (!option.strike) continue;
      if (option.instrumentType === 'CE') {
        this.expiryToStrikesMap[expiry].ce.push({
          strike: option.strike,
          token: option.instrumentToken,
          tradingSymbol: option.tradingsymbol,
        });
      } else {
        this.expiryToStrikesMap[expiry].pe.push({
          strike: option.strike,
          token: option.instrumentToken,
          tradingSymbol: option.tradingsymbol,
        });
      }
    }

    for (const strikes of Object.values(this.expiryToStrikesMap)) {
      strikes.ce.sort((a, b) => a.strike - b.strike);
      strikes.pe.sort((a, b) => a.strike - b.strike);
    }
    logger.info('Initialized expiries and strikes');
  }

  getUniqueExpiries() {
    return Object.keys(this.expiryToStrikesMap).sort((a, b) => a.localeCompare(b));
  }

  getStrikesForExpiry(expiry: string, atm: number): StrikeTokensMap {
    if (!this.expiryToStrikesMap[expiry]) {
      throw new Error(`Expiry ${expiry} not found`);
    }

    const ces = this.expiryToStrikesMap[expiry]!.ce;
    const nearestCeStrike = sortBy(ces, [(c) => Math.abs(c.strike - atm)])[0]!;
    const nearestCeIndex = ces.findIndex((c) => c.strike === nearestCeStrike.strike);
    const ceMinus = nearestCeIndex > 0 ? ces[nearestCeIndex - 1]! : ces[nearestCeIndex]!;
    const cePlus = nearestCeIndex < ces.length - 1 ? ces[nearestCeIndex + 1]! : ces[nearestCeIndex]!;

    const pes = this.expiryToStrikesMap[expiry]!.pe;
    const nearestPeStrike = sortBy(pes, [(p) => Math.abs(p.strike - atm)])[0]!;
    const nearestPeIndex = pes.findIndex((p) => p.strike === nearestPeStrike.strike);
    const peMinus = nearestPeIndex > 0 ? pes[nearestPeIndex - 1]! : pes[nearestPeIndex]!;
    const pePlus = nearestPeIndex < pes.length - 1 ? pes[nearestPeIndex + 1]! : pes[nearestPeIndex]!;

    return {
      ceMinus,
      cePlus,
      peMinus,
      pePlus,
    };
  }
}

export const strikesService = new StrikesService();
