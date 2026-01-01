import { db } from '@server/db';
import { settingsTable } from '@server/db/schema';
import { logger } from '@server/lib/logger';
import { CONFIG, NUMERIC_VIX_SYMBOLS, type Symbol } from '@server/shared/config';
import { eq } from 'drizzle-orm';

/**
 * Settings keys used in the application.
 */
export const SETTINGS_KEYS = {
  SD_MULTIPLIER: 'SD_MULTIPLIER',
} as const;

/**
 * Generate settings key for a commodity setting.
 */
function commodityKey(symbol: Symbol, field: 'VIX' | 'BIDBALANCE' | 'MULTIPLIER'): string {
  return `${field}_${symbol}`;
}

/**
 * Get all symbols from CONFIG.
 */
const ALL_SYMBOLS = Object.keys(CONFIG) as Symbol[];

/**
 * Build default values from CONFIG.
 */
function buildDefaultValues(): Record<string, string> {
  const defaults: Record<string, string> = {
    [SETTINGS_KEYS.SD_MULTIPLIER]: '2.05',
  };

  for (const symbol of ALL_SYMBOLS) {
    const config = CONFIG[symbol];

    // Only store VIX for numeric VIX symbols
    if (NUMERIC_VIX_SYMBOLS.includes(symbol as (typeof NUMERIC_VIX_SYMBOLS)[number])) {
      defaults[commodityKey(symbol, 'VIX')] = String(config.vix);
    }

    // Store bidBalance and multiplier for all symbols
    defaults[commodityKey(symbol, 'BIDBALANCE')] = String(config.bidBalance);
    defaults[commodityKey(symbol, 'MULTIPLIER')] = String(config.multiplier);
  }

  return defaults;
}

const DEFAULT_VALUES = buildDefaultValues();

/**
 * Type for commodity config returned by API.
 */
export interface CommodityConfig {
  symbol: Symbol;
  vix: number;
  vixUpdatable: boolean;
  bidBalance: number;
  multiplier: number;
}

class SettingsService {
  /**
   * Get a setting value by key.
   * Returns null if the setting doesn't exist.
   */
  async get(key: string): Promise<string | null> {
    const result = await db.select().from(settingsTable).where(eq(settingsTable.key, key)).limit(1);
    return result[0]?.value ?? null;
  }

  /**
   * Get a setting value as a number.
   * Returns the default value if the setting doesn't exist or is invalid.
   */
  async getNumber(key: string, defaultValue: number): Promise<number> {
    const value = await this.get(key);
    if (value === null) {
      return defaultValue;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Set a setting value. Creates or updates the setting.
   */
  async set(key: string, value: string): Promise<void> {
    await db.insert(settingsTable).values({ key, value }).onConflictDoUpdate({
      target: settingsTable.key,
      set: { value },
    });
    logger.info(`Setting updated: ${key} = ${value}`);
  }

  /**
   * Initialize default settings if they don't exist.
   * Should be called on app startup.
   */
  async initializeDefaults(): Promise<void> {
    logger.info('Initializing default settings...');

    for (const [key, defaultValue] of Object.entries(DEFAULT_VALUES)) {
      const existing = await this.get(key);
      if (existing === null) {
        await this.set(key, defaultValue);
        logger.info(`Initialized setting: ${key} = ${defaultValue}`);
      }
    }

    logger.info('Settings initialization complete');
  }

  // ==================== SD Multiplier ====================

  /**
   * Get the SD multiplier setting.
   */
  async getSdMultiplier(): Promise<number> {
    return this.getNumber(SETTINGS_KEYS.SD_MULTIPLIER, 2.05);
  }

  /**
   * Set the SD multiplier setting.
   */
  async setSdMultiplier(value: number): Promise<void> {
    await this.set(SETTINGS_KEYS.SD_MULTIPLIER, value.toString());
  }

  // ==================== Commodity Settings ====================

  /**
   * Get VIX for a symbol.
   */
  async getVix(symbol: Symbol): Promise<number> {
    const config = CONFIG[symbol];
    return this.getNumber(commodityKey(symbol, 'VIX'), config.vix);
  }

  /**
   * Set VIX for a symbol.
   */
  async setVix(symbol: Symbol, value: number): Promise<void> {
    await this.set(commodityKey(symbol, 'VIX'), value.toString());
  }

  /**
   * Get bidBalance for a symbol.
   */
  async getBidBalance(symbol: Symbol): Promise<number> {
    return this.getNumber(commodityKey(symbol, 'BIDBALANCE'), CONFIG[symbol].bidBalance);
  }

  /**
   * Set bidBalance for a symbol.
   */
  async setBidBalance(symbol: Symbol, value: number): Promise<void> {
    await this.set(commodityKey(symbol, 'BIDBALANCE'), value.toString());
  }

  /**
   * Get multiplier for a symbol.
   */
  async getMultiplier(symbol: Symbol): Promise<number> {
    return this.getNumber(commodityKey(symbol, 'MULTIPLIER'), CONFIG[symbol].multiplier);
  }

  /**
   * Set multiplier for a symbol.
   */
  async setMultiplier(symbol: Symbol, value: number): Promise<void> {
    await this.set(commodityKey(symbol, 'MULTIPLIER'), value.toString());
  }

  /**
   * Get all commodity configs with current values.
   */
  async getAllCommodityConfigs(): Promise<CommodityConfig[]> {
    const configs: CommodityConfig[] = [];

    for (const symbol of ALL_SYMBOLS) {
      const isNumericVix = NUMERIC_VIX_SYMBOLS.includes(symbol as (typeof NUMERIC_VIX_SYMBOLS)[number]);

      configs.push({
        symbol,
        vix: await this.getVix(symbol),
        vixUpdatable: isNumericVix,
        bidBalance: await this.getBidBalance(symbol),
        multiplier: await this.getMultiplier(symbol),
      });
    }

    return configs;
  }

  /**
   * Update commodity settings for a symbol.
   */
  async updateCommodityConfig(
    symbol: Symbol,
    updates: { vix?: number; bidBalance?: number; multiplier?: number }
  ): Promise<void> {
    if (updates.vix !== undefined) {
      await this.setVix(symbol, updates.vix);
    }

    if (updates.bidBalance !== undefined) {
      await this.setBidBalance(symbol, updates.bidBalance);
    }

    if (updates.multiplier !== undefined) {
      await this.setMultiplier(symbol, updates.multiplier);
    }
    logger.info(`Commodity config updated: ${symbol} = ${JSON.stringify(updates)}`);
  }
}

export const settingsService = new SettingsService();
