import { db } from '@server/db';
import { instrumentsTable } from '@server/db/schema';
import { logger } from '@server/lib/logger';
import { calculateMarketMinutesInRange, calculateMarketMinutesTillExpiry } from '@server/lib/utils/market-minutes';
import { parseISO, subYears } from 'date-fns';
import { inArray } from 'drizzle-orm';

// Cache for market minutes calculations
class MarketMinutesCache {
  private marketMinutesInLastYear: number | null = null;
  private expiryMinutesMap: Map<string, number> = new Map();

  /**
   * Get market minutes in the last year (T in the SD formula)
   * Calculates from 1 year ago to today and caches the result
   */
  async getMarketMinutesInLastYear(): Promise<number> {
    if (this.marketMinutesInLastYear !== null) {
      return this.marketMinutesInLastYear;
    }

    const today = new Date();
    const oneYearAgo = subYears(today, 1);

    this.marketMinutesInLastYear = await calculateMarketMinutesInRange(oneYearAgo, today);
    logger.info(`Cached market minutes in last year: ${this.marketMinutesInLastYear}`);

    return this.marketMinutesInLastYear;
  }

  /**
   * Get market minutes till expiry for a specific expiry date
   * Caches the result for future use
   */
  async getMarketMinutesTillExpiry(expiryDate: string): Promise<number> {
    if (this.expiryMinutesMap.has(expiryDate)) {
      return this.expiryMinutesMap.get(expiryDate)!;
    }

    // Validate expiry date before processing
    if (!(await this.isValidExpiryDate(expiryDate))) {
      console.warn(`Invalid expiry date encountered: "${expiryDate}". Skipping...`);
      this.expiryMinutesMap.set(expiryDate, 0);
      return 0;
    }

    const marketMinutes = await calculateMarketMinutesTillExpiry(expiryDate);
    this.expiryMinutesMap.set(expiryDate, marketMinutes);

    return marketMinutes;
  }

  /**
   * Validate if an expiry date string is valid
   */
  private async isValidExpiryDate(expiryDate: string): Promise<boolean> {
    if (!expiryDate || typeof expiryDate !== 'string' || expiryDate.trim() === '') {
      return false;
    }

    // Try to parse the date
    try {
      const trimmed = expiryDate.trim();
      let parsed: Date;

      // Try ISO format first (YYYY-MM-DD)
      if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
        parsed = parseISO(trimmed);
      }
      // Try Shoonya format (DD-MMM-YYYY)
      else if (trimmed.match(/^\d{2}-[A-Z]{3}-\d{4}$/)) {
        const { parse } = await import('date-fns');
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
    } catch (error) {
      return false;
    }
  }

  /**
   * Pre-populate the cache with unique expiry dates
   * Should be called on startup with all unique expiry dates from the database
   */
  async prePopulateExpiryCache(uniqueExpiryDates: string[]): Promise<void> {
    logger.info(`Pre-populating expiry cache with ${uniqueExpiryDates.length} unique expiry dates...`);

    // Filter out invalid dates first
    const validationPromises = uniqueExpiryDates.map(async (date) => {
      const isValid = await this.isValidExpiryDate(date);
      if (!isValid) {
        console.warn(`Skipping invalid expiry date: "${date}"`);
      }
      return { date, isValid };
    });

    const validationResults = await Promise.all(validationPromises);
    const validExpiryDates = validationResults.filter((result) => result.isValid).map((result) => result.date);

    logger.info(`Found ${validExpiryDates.length} valid expiry dates out of ${uniqueExpiryDates.length} total`);

    const promises = validExpiryDates.map(async (expiryDate) => {
      try {
        const marketMinutes = await calculateMarketMinutesTillExpiry(expiryDate);
        this.expiryMinutesMap.set(expiryDate, marketMinutes);
        return { expiryDate, marketMinutes, success: true };
      } catch (error) {
        logger.error(`Error calculating market minutes for expiry "${expiryDate}":`, error);
        this.expiryMinutesMap.set(expiryDate, 0);
        return { expiryDate, marketMinutes: 0, success: false };
      }
    });

    const results = await Promise.all(promises);
    const successful = results.filter((r) => r.success);
    logger.info(
      `Expiry cache populated: ${successful.length} successful, ${results.length - successful.length} failed`
    );
    logger.info(this.expiryMinutesMap);
  }

  /**
   * Get daily volatility from annual volatility using market minutes
   * DV = AV / sqrt(T) where T is market minutes in last year
   */
  async getDvFromAv(v: number): Promise<number> {
    const T = await this.getMarketMinutesInLastYear();

    if (T === 0) return 0;

    return v / Math.sqrt(T);
  }

  /**
   * Calculate Standard Deviation using cached values
   * SD = AV / sqrt(T/N)
   * where T = market minutes in last year, N = market minutes till expiry
   */
  async calculateSD(av: number, expiryDate: string): Promise<number> {
    const T = await this.getMarketMinutesInLastYear();
    const N = await this.getMarketMinutesTillExpiry(expiryDate);

    if (N === 0 || T === 0) return 0; // Avoid division by zero

    return av / Math.sqrt(T / N);
  }

  /**
   * Step 1: Calculate σₙ (Sigma N)
   * σₙ = sdMultiplier * Annual Volatility
   * @param av Annual Volatility from NSE data
   * @param sdMultiplier User-defined multiplier
   * @returns σₙ value
   */
  calculateSigmaN(sigma: number, sdMultiplier: number): number {
    return sigma * sdMultiplier;
  }

  /**
   * Step 2: Calculate σₓ (Error Deviation)
   * σₓ = σₙ / sqrt(T/N)
   * @param sigmaN σₙ value from step 1
   * @param expiryDate Expiry date string
   * @returns σₓ value
   */
  async calculateSigmaX(sigmaN: number, expiryDate: string): Promise<number> {
    if (!sigmaN || sigmaN <= 0) return 0;

    const T = await this.getMarketMinutesInLastYear();
    const N = await this.getMarketMinutesTillExpiry(expiryDate);

    if (N === 0 || T === 0) return 0; // Avoid division by zero

    return sigmaN / Math.sqrt(T / N);
  }

  /**
   * Step 3: Calculate σₓᵢ (Confidence Deviation)
   * For CE: σₓᵢ = σₙ + σₓ
   * For PE: σₓᵢ = σₙ - σₓ
   * @param sigmaN σₙ value from step 1
   * @param sigmaX σₓ value from step 2
   * @param optionType 'CE' for call options, 'PE' for put options
   * @returns σₓᵢ value
   */
  calculateSigmaXI(sigmaN: number, sigmaX: number, optionType: 'CE' | 'PE'): number {
    if (!sigmaN || sigmaN < 0 || !sigmaX || sigmaX < 0) return 0;
    return optionType === 'CE' ? sigmaN + sigmaX : sigmaN - sigmaX;
  }

  /**
   * Complete calculation for all sigma values
   * @param av Annual Volatility
   * @param sdMultiplier User multiplier
   * @param expiryDate Expiry date
   * @param optionType Option type
   * @returns Object with all sigma values
   */
  async calculateAllSigmas(
    av: number,
    sdMultiplier: number,
    expiryDate: string,
    optionType: 'CE' | 'PE'
  ): Promise<{
    sigmaN: number;
    sigmaX: number;
    sigmaXI: number;
  }> {
    const sigma = await this.calculateSD(av, expiryDate);
    const sigmaN = this.calculateSigmaN(sigma, sdMultiplier);
    const sigmaX = await this.calculateSigmaX(sigmaN, expiryDate);
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
      // Initialize market minutes in last year
      await this.getMarketMinutesInLastYear();

      // Get unique option expiry dates from database and populate cache
      const result = await db
        .selectDistinct({ expiry: instrumentsTable.expiry })
        .from(instrumentsTable)
        .where(inArray(instrumentsTable.instrumentType, ['CE', 'PE']));
      const uniqueExpiryDates = result
        .map((row) => row.expiry)
        .filter((expiry) => expiry && expiry.trim() !== '') as string[];
      await this.prePopulateExpiryCache(uniqueExpiryDates);

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
    this.expiryMinutesMap.clear();
  }

  /**
   * Get cache status for debugging
   */
  getCacheStatus() {
    return {
      marketMinutesInLastYear: this.marketMinutesInLastYear,
      expiryDatesCount: this.expiryMinutesMap.size,
      expiryDates: Array.from(this.expiryMinutesMap.keys()),
    };
  }
}

// Export a singleton instance (keeping old name for compatibility)
export const workingDaysCache = new MarketMinutesCache();
