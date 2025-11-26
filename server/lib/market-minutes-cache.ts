import { db } from '@server/db';
import { instrumentsTable } from '@server/db/schema';
import { logger } from '@server/lib/logger';
import {
  calculateMarketMinutesInRange,
  calculateMarketMinutesTillExpiry,
  loadHolidayCache,
} from '@server/lib/utils/market-minutes';
import { parse, parseISO, subYears } from 'date-fns';
import { inArray } from 'drizzle-orm';

// TTL for expiry minutes cache (1 minute in milliseconds)
const EXPIRY_CACHE_TTL_MS = 60 * 1000;

type ExpiryMinutesCacheEntry = {
  value: number;
  timestamp: number;
};

// Cache for market minutes calculations
class MarketMinutesCache {
  private marketMinutesInLastYear: number | null = null;
  private validExpiryDates: Set<string> = new Set();
  private expiryMinutesCache: Map<string, ExpiryMinutesCacheEntry> = new Map();

  /**
   * Get market minutes in the last year (T in the SD formula)
   * Calculates from 1 year ago to today and caches the result
   * This value is static for the day, so caching is fine
   */
  getMarketMinutesInLastYear(): number {
    if (this.marketMinutesInLastYear !== null) {
      return this.marketMinutesInLastYear;
    }

    const today = new Date();
    const oneYearAgo = subYears(today, 1);

    this.marketMinutesInLastYear = calculateMarketMinutesInRange(oneYearAgo, today);
    logger.info(`Cached market minutes in last year: ${this.marketMinutesInLastYear}`);

    return this.marketMinutesInLastYear;
  }

  /**
   * Get market minutes till expiry for a specific expiry date
   * Uses a 1-minute TTL cache for performance, while still reflecting near-real-time values
   */
  getMarketMinutesTillExpiry(expiryDate: string): number {
    // Validate expiry date
    if (!this.validExpiryDates.has(expiryDate)) {
      logger.warn(`Unknown expiry date: "${expiryDate}". Returning 0.`);
      return 0;
    }

    const now = Date.now();
    const cached = this.expiryMinutesCache.get(expiryDate);

    // Return cached value if still valid (less than 1 minute old)
    if (cached && now - cached.timestamp < EXPIRY_CACHE_TTL_MS) {
      return cached.value;
    }

    // Calculate fresh value and cache it
    const value = calculateMarketMinutesTillExpiry(expiryDate);
    this.expiryMinutesCache.set(expiryDate, { value, timestamp: now });

    return value;
  }

  /**
   * Pre-validate expiry dates at startup
   * Only stores which dates are valid, NOT the market minutes values
   */
  private preValidateExpiryDates(expiryDates: string[]): void {
    logger.info(`Pre-validating ${expiryDates.length} expiry dates...`);

    for (const date of expiryDates) {
      if (this.isValidExpiryDate(date)) {
        this.validExpiryDates.add(date);
      } else {
        logger.warn(`Skipping invalid expiry date: "${date}"`);
      }
    }

    logger.info(`Validated ${this.validExpiryDates.size} expiry dates`);
  }

  /**
   * Validate if an expiry date string is valid
   */
  private isValidExpiryDate(expiryDate: string): boolean {
    if (!expiryDate || typeof expiryDate !== 'string' || expiryDate.trim() === '') {
      return false;
    }

    try {
      const trimmed = expiryDate.trim();
      let parsed: Date;

      // Try ISO format first (YYYY-MM-DD)
      if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
        parsed = parseISO(trimmed);
      }
      // Try Shoonya format (DD-MMM-YYYY)
      else if (trimmed.match(/^\d{2}-[A-Z]{3}-\d{4}$/)) {
        parsed = parse(trimmed, 'dd-MMM-yyyy', new Date());
      }
      // Fallback: try native Date parsing
      else {
        parsed = new Date(trimmed);
      }

      // Check if it's a valid date
      if (isNaN(parsed.getTime())) {
        return false;
      }

      // Additional check: make sure it's not too far in the past or future
      const now = new Date();
      const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const fiveYearsFromNow = new Date(now.getFullYear() + 5, now.getMonth(), now.getDate());

      return parsed >= oneYearAgo && parsed <= fiveYearsFromNow;
    } catch {
      return false;
    }
  }

  /**
   * Get daily volatility from annual volatility using market minutes
   * DV = AV / sqrt(T) where T is market minutes in last year
   */
  getDvFromAv(v: number): number {
    const T = this.getMarketMinutesInLastYear();

    if (T === 0) return 0;

    return v / Math.sqrt(T);
  }

  /**
   * Calculate Standard Deviation using cached values
   * SD = AV / sqrt(T/N)
   * where T = market minutes in last year, N = market minutes till expiry
   */
  calculateSD(av: number, expiryDate: string): number {
    const T = this.getMarketMinutesInLastYear();
    const N = this.getMarketMinutesTillExpiry(expiryDate);

    if (N === 0 || T === 0) return 0; // Avoid division by zero

    return av / Math.sqrt(T / N);
  }

  /**
   * Step 1: Calculate σₙ (Sigma N)
   * σₙ = sdMultiplier * Annual Volatility
   */
  calculateSigmaN(sigma: number, sdMultiplier: number): number {
    return sigma * sdMultiplier;
  }

  /**
   * Step 2: Calculate σₓ (Error Deviation)
   * σₓ = σₙ / sqrt(T/N)
   */
  calculateSigmaX(sigmaN: number, expiryDate: string): number {
    if (!sigmaN || sigmaN <= 0) return 0;

    const T = this.getMarketMinutesInLastYear();
    const N = this.getMarketMinutesTillExpiry(expiryDate);

    if (N === 0 || T === 0) return 0; // Avoid division by zero

    return sigmaN / Math.sqrt(T / N);
  }

  /**
   * Step 3: Calculate σₓᵢ (Confidence Deviation)
   * For CE: σₓᵢ = σₙ + σₓ
   * For PE: σₓᵢ = σₙ - σₓ
   */
  calculateSigmaXI(sigmaN: number, sigmaX: number, optionType: 'CE' | 'PE'): number {
    if (!sigmaN || sigmaN < 0 || !sigmaX || sigmaX < 0) return 0;
    return optionType === 'CE' ? sigmaN + sigmaX : sigmaN - sigmaX;
  }

  /**
   * Complete calculation for all sigma values
   */
  calculateAllSigmas(
    av: number,
    sdMultiplier: number,
    expiryDate: string,
    optionType: 'CE' | 'PE'
  ): {
    sigmaN: number;
    sigmaX: number;
    sigmaXI: number;
  } {
    const sigma = this.calculateSD(av, expiryDate);
    const sigmaN = this.calculateSigmaN(sigma, sdMultiplier);
    const sigmaX = this.calculateSigmaX(sigmaN, expiryDate);
    const sigmaXI = this.calculateSigmaXI(sigmaN, sigmaX, optionType);

    return { sigmaN, sigmaX, sigmaXI };
  }

  /**
   * Initialize cache at runtime (for production use)
   * This should be called when the application starts
   */
  async initializeRuntimeCache(): Promise<void> {
    logger.info('Initializing market minutes cache at runtime...');

    try {
      // Load holidays into memory cache first
      await loadHolidayCache();

      // Initialize market minutes in last year (this is cached)
      this.getMarketMinutesInLastYear();

      // Get unique option expiry dates from database and validate them
      const result = await db
        .selectDistinct({ expiry: instrumentsTable.expiry })
        .from(instrumentsTable)
        .where(inArray(instrumentsTable.instrumentType, ['CE', 'PE']));

      const uniqueExpiryDates = result
        .map((row) => row.expiry)
        .filter((expiry) => expiry && expiry.trim() !== '') as string[];

      this.preValidateExpiryDates(uniqueExpiryDates);

      logger.info('Runtime cache initialization completed successfully!');
    } catch (error) {
      logger.error('Failed to initialize runtime cache:', error);
      // Don't throw error to prevent application startup failure
    }
  }

  /**
   * Clear all cached values (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.marketMinutesInLastYear = null;
    this.validExpiryDates.clear();
    this.expiryMinutesCache.clear();
  }

  /**
   * Get cache status for debugging
   */
  getCacheStatus() {
    return {
      marketMinutesInLastYear: this.marketMinutesInLastYear,
      validExpiryDatesCount: this.validExpiryDates.size,
      validExpiryDates: Array.from(this.validExpiryDates),
      expiryMinutesCacheSize: this.expiryMinutesCache.size,
    };
  }
}

// Export a singleton instance
export const marketMinutesCache = new MarketMinutesCache();

// Keep old name for backward compatibility
export const workingDaysCache = marketMinutesCache;
