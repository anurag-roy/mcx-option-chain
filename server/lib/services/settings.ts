import { db } from '@server/db';
import { settingsTable } from '@server/db/schema';
import { logger } from '@server/lib/logger';
import { eq } from 'drizzle-orm';

/**
 * Settings keys used in the application.
 * Extend this as new settings are added.
 */
export const SETTINGS_KEYS = {
  SD_MULTIPLIER: 'SD_MULTIPLIER',
  // Future: volatility overrides will be added here
  // e.g., VOLATILITY_NATURALGAS: 'VOLATILITY_NATURALGAS'
} as const;

/**
 * Default values for settings.
 * These are used when initializing the database.
 */
const DEFAULT_VALUES: Record<string, string> = {
  [SETTINGS_KEYS.SD_MULTIPLIER]: '2.05',
};

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
      } else {
        logger.info(`Setting already exists: ${key} = ${existing}`);
      }
    }
  }

  /**
   * Get the SD multiplier setting.
   * Returns 2.05 as default if not set.
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
}

export const settingsService = new SettingsService();
