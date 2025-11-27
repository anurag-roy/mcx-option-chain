/**
 * Worker process for handling KiteTicker connections for a subset of symbols.
 * This file is spawned as a child process by the coordinator (index.ts).
 *
 * Environment variables:
 * - SYMBOLS: Comma-separated list of symbols to handle (required)
 * - WORKER_ID: Worker identifier for logging (optional)
 */

import { env } from '@server/lib/env';
import { logger } from '@server/lib/logger';
import { workingDaysCache } from '@server/lib/market-minutes-cache';
import { kiteService } from '@server/lib/services/kite';
import { tickerService } from '@server/lib/services/ticker';
import { volatilityService } from '@server/lib/services/volatility';
import type { Symbol } from '@server/shared/config';
import type { OptionChain } from '@shared/types/types';

// Message types for IPC communication
export type WorkerMessage =
  | { type: 'optionChain'; data: Record<number, OptionChain> }
  | { type: 'ready' }
  | { type: 'error'; error: string };

export type CoordinatorMessage = { type: 'subscribe'; sdMultiplier: number } | { type: 'shutdown' };

const workerId = env.WORKER_ID ?? 0;
const logPrefix = `[Worker ${workerId}]`;

// Parse symbols from environment
const symbolsEnv = env.SYMBOLS;
if (!symbolsEnv) {
  logger.error(`${logPrefix} SYMBOLS environment variable is required`);
  process.exit(1);
}

const symbols = symbolsEnv.split(',').map((s) => s.trim()) as Symbol[];
logger.info(`${logPrefix} Starting worker for symbols: ${symbols.join(', ')}`);

// Set symbols filter for services
volatilityService.setSymbolsFilter(symbols);
tickerService.setSymbolsFilter(symbols);

// Set up data callback to send option chain to coordinator
tickerService.setDataCallback((data) => {
  if (process.send) {
    process.send({ type: 'optionChain', data } satisfies WorkerMessage);
  }
});

async function main() {
  // Verify Kite session
  try {
    await kiteService.getProfile();
    logger.info(`${logPrefix} Logged in as ${env.KITE_USER_ID}`);
  } catch (error) {
    logger.error(`${logPrefix} Session expired. Please login again using 'npm run login'`);
    process.exit(1);
  }

  // Initialize market minutes cache
  try {
    await workingDaysCache.initializeRuntimeCache();
  } catch (error) {
    logger.error(`${logPrefix} Failed to initialize market minutes cache`);
    process.exit(1);
  }

  // Initialize volatility service
  try {
    await volatilityService.init();
  } catch (error) {
    logger.error(`${logPrefix} Failed to initialize volatility service`);
    process.exit(1);
  }

  // Initialize ticker service
  try {
    await tickerService.init();
  } catch (error) {
    logger.error(`${logPrefix} Failed to connect to Kite Ticker`);
    process.exit(1);
  }

  // Listen for messages from coordinator
  process.on('message', async (msg: CoordinatorMessage) => {
    if (msg.type === 'subscribe') {
      logger.info(`${logPrefix} Received subscribe command with sdMultiplier: ${msg.sdMultiplier}`);
      await tickerService.subscribeAll(msg.sdMultiplier);
    } else if (msg.type === 'shutdown') {
      logger.info(`${logPrefix} Received shutdown command`);
      await tickerService.disconnect();
      process.exit(0);
    }
  });

  // Notify coordinator that worker is ready
  if (process.send) {
    process.send({ type: 'ready' } satisfies WorkerMessage);
  }

  logger.info(`${logPrefix} Worker ready`);
}

main().catch((error) => {
  logger.error(`${logPrefix} Worker failed to start:`, error);
  if (process.send) {
    process.send({ type: 'error', error: String(error) } satisfies WorkerMessage);
  }
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info(`${logPrefix} Received SIGTERM, shutting down...`);
  await tickerService.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info(`${logPrefix} Received SIGINT, shutting down...`);
  await tickerService.disconnect();
  process.exit(0);
});

