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
  vix: number | string; // number for updatable, string (symbol) for readonly
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
   * For numeric VIX symbols, returns the stored value.
   * For symbol-based VIX, returns the Yahoo Finance symbol from CONFIG.
   */
  async getVix(symbol: Symbol): Promise<number | string> {
    const config = CONFIG[symbol];
    const isNumeric = NUMERIC_VIX_SYMBOLS.includes(symbol as (typeof NUMERIC_VIX_SYMBOLS)[number]);

    if (isNumeric) {
      return this.getNumber(commodityKey(symbol, 'VIX'), config.vix as number);
    }

    // Return the Yahoo Finance symbol for non-numeric VIX
    return config.vix as string;
  }

  /**
   * Set VIX for a symbol (only works for numeric VIX symbols).
   */
  async setVix(symbol: Symbol, value: number): Promise<boolean> {
    const isNumeric = NUMERIC_VIX_SYMBOLS.includes(symbol as (typeof NUMERIC_VIX_SYMBOLS)[number]);
    if (!isNumeric) {
      logger.warn(`Cannot set VIX for ${symbol}: not a numeric VIX symbol`);
      return false;
    }
    await this.set(commodityKey(symbol, 'VIX'), value.toString());
    return true;
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
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (updates.vix !== undefined) {
      const success = await this.setVix(symbol, updates.vix);
      if (!success) {
        errors.push(`VIX is not updatable for ${symbol}`);
      }
    }

    if (updates.bidBalance !== undefined) {
      await this.setBidBalance(symbol, updates.bidBalance);
    }

    if (updates.multiplier !== undefined) {
      await this.setMultiplier(symbol, updates.multiplier);
    }

    return { success: errors.length === 0, errors };
  }
}

export const settingsService = new SettingsService();
