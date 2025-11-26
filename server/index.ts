import { serve } from '@hono/node-server';
import app, { injectWebSocket } from '@server/app';
import { env } from '@server/lib/env';
import { logger } from '@server/lib/logger';
import { workingDaysCache } from '@server/lib/market-minutes-cache';
import { kiteService } from '@server/lib/services/kite';
import { tickerService } from '@server/lib/services/ticker';
import { volatilityService } from '@server/lib/services/volatility';

try {
  await kiteService.getProfile();
  logger.info(`Logged in as ${env.KITE_USER_ID}`);
} catch (error) {
  logger.info('Session expired. Please login again using `npm run login`');
  process.exit(1);
}

try {
  await workingDaysCache.initializeRuntimeCache();
} catch (error) {
  logger.error('Failed to initialize market minutes cache');
  process.exit(1);
}

try {
  await volatilityService.init();
} catch (error) {
  logger.error('Failed to initialize volatility service');
  process.exit(1);
}

try {
  await tickerService.init();
} catch (error) {
  logger.error('Failed to connect to Kite Ticker');
  process.exit(1);
}

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info(`Server started on http://localhost:${info.port}`);
  }
);
injectWebSocket(server);

// Test ticker subscribe method
setTimeout(() => {
  logger.info('Subscribing to GOLD');
  tickerService.subscribe('GOLD', 2);
}, 5000);
