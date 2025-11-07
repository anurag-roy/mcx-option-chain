import { serve } from '@hono/node-server';
import app, { injectWebSocket } from '@server/app';
import { db } from '@server/db';
import { instruments } from '@server/db/schema';
import { env } from '@server/lib/env';
import { logger } from '@server/lib/logger';
import { kiteService } from '@server/lib/services/kite';
import { tickerService } from '@server/lib/services/ticker';
import { eq } from 'drizzle-orm';
import { strikesService } from './lib/services/strikes';

try {
  await kiteService.getProfile();
  logger.info(`Logged in as ${env.KITE_USER_ID}`);
} catch (error) {
  logger.info('Session expired. Please login again using `npm run login`');
  process.exit(1);
}

const [niftyToken] = await db.select().from(instruments).where(eq(instruments.tradingsymbol, 'NIFTY 50')).limit(1);
if (!niftyToken) {
  logger.error('NIFTY 50 instrument not found. Please run `npm run seed` to seed the database.');
  process.exit(1);
}

try {
  await tickerService.init(niftyToken.instrumentToken);
  logger.info('Connected to Kite Ticker');
} catch (error) {
  logger.error('Failed to connect to Kite Ticker');
  process.exit(1);
}

logger.info('Subscribing to NIFTY 50...');
try {
  tickerService.subscribeToNifty();
  logger.info('Subscribed to NIFTY 50');
} catch (error) {
  logger.error('Failed to subscribe to NIFTY 50');
  process.exit(1);
}

await strikesService.init();

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
