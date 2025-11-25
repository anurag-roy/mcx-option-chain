import { TZDate } from '@date-fns/tz';
import { db } from '@server/db';
import { holidaysTable, type HolidayType } from '@server/db/schema';
import { logger } from '@server/lib/logger';
import {
  addDays,
  eachDayOfInterval,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isWeekend,
  parse,
  parseISO,
  startOfDay,
} from 'date-fns';

const INDIA_TIMEZONE = 'Asia/Kolkata';
const US_TIMEZONE = 'America/New_York';

// Global holiday cache - loaded once at startup
let holidayCache: Map<string, HolidayType> | null = null;

/**
 * Load all holidays from database into memory cache
 * Should be called once at application startup
 */
export async function loadHolidayCache(): Promise<void> {
  const holidays = await db.select({ date: holidaysTable.date, type: holidaysTable.type }).from(holidaysTable);

  holidayCache = new Map<string, HolidayType>();
  for (const h of holidays) {
    holidayCache.set(h.date, h.type);
  }

  logger.info(`Loaded ${holidayCache.size} holidays into cache`);
}

/**
 * Get holiday type for a specific date from cache
 */
function getHolidayType(dateStr: string): HolidayType | undefined {
  return holidayCache?.get(dateStr);
}

/**
 * Check if holiday cache is loaded
 */
export function isHolidayCacheLoaded(): boolean {
  return holidayCache !== null;
}

// Market session times (in IST)
const MORNING_START_HOUR = 9;
const MORNING_START_MINUTE = 0;
const MORNING_END_HOUR = 17; // 5:00 PM
const MORNING_END_MINUTE = 0;
const EVENING_END_DST_HOUR = 23; // 11:30 PM during US DST
const EVENING_END_DST_MINUTE = 30;
const EVENING_END_NON_DST_HOUR = 23; // 11:55 PM when US is not in DST
const EVENING_END_NON_DST_MINUTE = 55;

// Pre-calculated session minutes
const MORNING_SESSION_MINUTES = 480; // 9:00 AM - 5:00 PM = 8 hours
const EVENING_SESSION_DST_MINUTES = 390; // 5:00 PM - 11:30 PM = 6.5 hours
const EVENING_SESSION_NON_DST_MINUTES = 415; // 5:00 PM - 11:55 PM = 6 hours 55 mins
const FULL_DAY_DST_MINUTES = MORNING_SESSION_MINUTES + EVENING_SESSION_DST_MINUTES; // 870
const FULL_DAY_NON_DST_MINUTES = MORNING_SESSION_MINUTES + EVENING_SESSION_NON_DST_MINUTES; // 895

/**
 * Check if US is observing Daylight Saving Time for a given date
 * US DST: Second Sunday of March to First Sunday of November
 * When US is in DST, MCX closes at 11:30 PM IST
 * When US is NOT in DST, MCX closes at 11:55 PM IST
 */
export function isUsDst(date: Date): boolean {
  const usDate = new TZDate(date, US_TIMEZONE);

  // Get the timezone offset in minutes
  // During DST, US Eastern is UTC-4 (offset = -240)
  // During Standard Time, US Eastern is UTC-5 (offset = -300)
  const offset = usDate.getTimezoneOffset();

  // DST is active when offset is -240 (UTC-4)
  return offset === -240;
}

/**
 * Get evening session minutes based on DST status
 */
function getEveningSessionMinutes(date: Date): number {
  return isUsDst(date) ? EVENING_SESSION_DST_MINUTES : EVENING_SESSION_NON_DST_MINUTES;
}

/**
 * Get full day market minutes based on DST status
 */
export function getFullDayMinutes(date: Date): number {
  return isUsDst(date) ? FULL_DAY_DST_MINUTES : FULL_DAY_NON_DST_MINUTES;
}

/**
 * Get market minutes for a day based on holiday type and DST
 * @param date - The date to check
 * @param holidayType - Optional holiday type ('morning', 'evening', 'full')
 * @returns Number of market minutes for that day
 */
export function getMarketMinutesForDay(date: Date, holidayType?: HolidayType | null): number {
  // Full holiday = no market minutes
  if (holidayType === 'full') {
    return 0;
  }

  // Morning holiday = only evening session
  if (holidayType === 'morning') {
    return getEveningSessionMinutes(date);
  }

  // Evening holiday = only morning session
  if (holidayType === 'evening') {
    return MORNING_SESSION_MINUTES;
  }

  // Normal day = full market minutes
  return getFullDayMinutes(date);
}

/**
 * Get holidays for a given date range from cache
 * Uses the in-memory holiday cache instead of querying DB
 */
function getHolidaysInRange(startDate: Date, endDate: Date): Map<string, HolidayType> {
  const holidayMap = new Map<string, HolidayType>();

  if (!holidayCache) {
    logger.warn('Holiday cache not loaded, returning empty map');
    return holidayMap;
  }

  const allDays = eachDayOfInterval({ start: startDate, end: endDate });
  for (const day of allDays) {
    const dateStr = format(day, 'yyyy-MM-dd');
    const holidayType = holidayCache.get(dateStr);
    if (holidayType) {
      holidayMap.set(dateStr, holidayType);
    }
  }

  return holidayMap;
}

/**
 * Check if a date is a trading day (not weekend)
 */
function isTradingDay(date: Date): boolean {
  const indiaDate = new TZDate(date, INDIA_TIMEZONE);
  return !isWeekend(indiaDate);
}

/**
 * Parse expiry date string to Date object
 * Handles both ISO format (YYYY-MM-DD) and Shoonya format (DD-MMM-YYYY)
 */
function parseExpiryDate(expiryDate: string): Date {
  if (!expiryDate || typeof expiryDate !== 'string') {
    throw new Error('Invalid expiry date: must be a non-empty string');
  }

  const trimmed = expiryDate.trim();

  // Try ISO format first (YYYY-MM-DD)
  if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const parsed = parseISO(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // Try Shoonya format (DD-MMM-YYYY)
  if (trimmed.match(/^\d{2}-[A-Z]{3}-\d{4}$/)) {
    const parsed = parse(trimmed, 'dd-MMM-yyyy', new Date());
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // Fallback: try native Date parsing
  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) {
    return fallback;
  }

  throw new Error(`Unable to parse expiry date: "${expiryDate}". Expected format: DD-MMM-YYYY or YYYY-MM-DD`);
}

/**
 * Calculate remaining market minutes for today from current time
 * @param now - Current time in IST
 * @param holidayType - Holiday type for today if any
 * @returns Remaining market minutes for today
 */
function getRemainingMinutesToday(now: TZDate, holidayType?: HolidayType | null): number {
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeInMinutes = currentHour * 60 + currentMinute;

  const morningStart = MORNING_START_HOUR * 60 + MORNING_START_MINUTE; // 540 (9:00 AM)
  const morningEnd = MORNING_END_HOUR * 60 + MORNING_END_MINUTE; // 1020 (5:00 PM)
  const eveningEnd = isUsDst(now)
    ? EVENING_END_DST_HOUR * 60 + EVENING_END_DST_MINUTE // 1410 (11:30 PM)
    : EVENING_END_NON_DST_HOUR * 60 + EVENING_END_NON_DST_MINUTE; // 1435 (11:55 PM)

  // Handle full holiday - no minutes
  if (holidayType === 'full') {
    return 0;
  }

  // Handle morning holiday - only evening session available
  if (holidayType === 'morning') {
    // Before evening session starts
    if (currentTimeInMinutes < morningEnd) {
      return eveningEnd - morningEnd;
    }
    // During evening session
    if (currentTimeInMinutes < eveningEnd) {
      return eveningEnd - currentTimeInMinutes;
    }
    // After market close
    return 0;
  }

  // Handle evening holiday - only morning session available
  if (holidayType === 'evening') {
    // Before market opens
    if (currentTimeInMinutes < morningStart) {
      return morningEnd - morningStart;
    }
    // During morning session
    if (currentTimeInMinutes < morningEnd) {
      return morningEnd - currentTimeInMinutes;
    }
    // After morning session
    return 0;
  }

  // Normal day - full trading day
  // Before market opens
  if (currentTimeInMinutes < morningStart) {
    return getFullDayMinutes(now);
  }

  // During morning session
  if (currentTimeInMinutes < morningEnd) {
    const remainingMorning = morningEnd - currentTimeInMinutes;
    const eveningMinutes = getEveningSessionMinutes(now);
    return remainingMorning + eveningMinutes;
  }

  // During evening session
  if (currentTimeInMinutes < eveningEnd) {
    return eveningEnd - currentTimeInMinutes;
  }

  // After market close
  return 0;
}

/**
 * Calculate market minutes between two dates (inclusive)
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Total market minutes in the range
 */
export function calculateMarketMinutesInRange(startDate: Date | string, endDate: Date | string): number {
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
  const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;

  const indiaStart = new TZDate(startOfDay(start), INDIA_TIMEZONE);
  const indiaEnd = new TZDate(startOfDay(end), INDIA_TIMEZONE);

  if (isAfter(indiaStart, indiaEnd)) {
    throw new Error('Start date must be before or equal to end date');
  }

  // Get holidays in the date range from cache
  const holidayMap = getHolidaysInRange(indiaStart, indiaEnd);

  // Get all days in the interval
  const allDays = eachDayOfInterval({ start: indiaStart, end: indiaEnd });

  let totalMinutes = 0;

  for (const day of allDays) {
    // Skip weekends
    if (!isTradingDay(day)) {
      continue;
    }

    const dateStr = format(day, 'yyyy-MM-dd');
    const holidayType = holidayMap.get(dateStr);

    totalMinutes += getMarketMinutesForDay(day, holidayType);
  }

  return totalMinutes;
}

/**
 * Calculate market minutes till expiry from current time (intraday aware)
 * This is calculated fresh every time to reflect real-time remaining minutes
 * @param expiryDate - Expiry date of the option contract
 * @returns Total market minutes from now till expiry
 */
export function calculateMarketMinutesTillExpiry(expiryDate: Date | string): number {
  const now = new TZDate(new Date(), INDIA_TIMEZONE);
  const expiry = typeof expiryDate === 'string' ? parseExpiryDate(expiryDate) : expiryDate;
  const indiaExpiry = new TZDate(startOfDay(expiry), INDIA_TIMEZONE);
  const todayStart = new TZDate(startOfDay(now), INDIA_TIMEZONE);

  // If expiry is in the past, return 0
  if (isBefore(indiaExpiry, todayStart)) {
    return 0;
  }

  // Get holidays for the range from cache
  const holidayMap = getHolidaysInRange(todayStart, indiaExpiry);

  // Get today's holiday type if any
  const todayStr = format(todayStart, 'yyyy-MM-dd');
  const todayHolidayType = holidayMap.get(todayStr);

  let totalMinutes = 0;

  // If expiry is today
  if (isSameDay(now, indiaExpiry)) {
    // If today is a weekend, return 0
    if (!isTradingDay(now)) {
      return 0;
    }
    // Return remaining minutes for today
    return getRemainingMinutesToday(now, todayHolidayType);
  }

  // Calculate remaining minutes for today (if it's a trading day)
  if (isTradingDay(now)) {
    totalMinutes += getRemainingMinutesToday(now, todayHolidayType);
  }

  // Calculate full market minutes for days between tomorrow and expiry (inclusive)
  const tomorrow = addDays(todayStart, 1);

  if (!isAfter(tomorrow, indiaExpiry)) {
    const futureDays = eachDayOfInterval({ start: tomorrow, end: indiaExpiry });

    for (const day of futureDays) {
      // Skip weekends
      if (!isTradingDay(day)) {
        continue;
      }

      const dateStr = format(day, 'yyyy-MM-dd');
      const holidayType = holidayMap.get(dateStr);

      totalMinutes += getMarketMinutesForDay(day, holidayType);
    }
  }

  return totalMinutes;
}

/**
 * Check if a specific date is a holiday or weekend
 * Uses in-memory cache for holiday lookup
 */
export function checkDateStatus(date: Date | string) {
  const checkDate = typeof date === 'string' ? parseISO(date) : date;
  const indiaDate = new TZDate(checkDate, INDIA_TIMEZONE);
  const dateStr = format(indiaDate, 'yyyy-MM-dd');

  const isWeekendDay = isWeekend(indiaDate);
  const holidayType = getHolidayType(dateStr);
  const isHoliday = Boolean(holidayType);

  // A day is a full trading day only if it's not a weekend and not a full holiday
  const isFullTradingDay = !isWeekendDay && (!isHoliday || holidayType !== 'full');

  return {
    isHoliday,
    holidayType,
    isWeekend: isWeekendDay,
    isFullTradingDay,
    marketMinutes: isWeekendDay ? 0 : getMarketMinutesForDay(indiaDate, holidayType),
  };
}
