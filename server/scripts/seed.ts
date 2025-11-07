import { db } from '@server/db';
import { instruments } from '@server/db/schema';
import { logger } from '@server/lib/logger';
import { kiteService } from '@server/lib/services/kite';

const nseInstruments = await kiteService.getInstruments(['NSE']);
const nifty = nseInstruments.find((instrument) => instrument.tradingsymbol === 'NIFTY 50');

if (!nifty) {
  logger.error('NIFTY 50 instrument not found');
  process.exit(1);
}

const nfoInstruments = await kiteService.getInstruments(['NFO']);
const niftyOptions = nfoInstruments.filter(
  (instrument) => instrument.name === 'NIFTY' && ['CE', 'PE'].includes(instrument.instrument_type)
);

const combinedInstruments = [nifty, ...niftyOptions];

logger.info(`Seeding NIFTY 50 instruments`);

await db.transaction(async (tx) => {
  await tx.delete(instruments);
  await tx.insert(instruments).values(
    combinedInstruments.map((instrument) => ({
      instrumentToken: Number(instrument.instrument_token),
      exchangeToken: instrument.exchange_token,
      tradingsymbol: instrument.tradingsymbol,
      name: instrument.name,
      expiry: instrument.expiry ? instrument.expiry.toISOString().split('T')[0] : null,
      strike: instrument.strike,
      tickSize: instrument.tick_size,
      lotSize: instrument.lot_size,
      instrumentType: instrument.instrument_type,
      segment: instrument.segment,
      exchange: instrument.exchange,
    }))
  );
});

logger.info(`Seeded ${combinedInstruments.length} NIFTY 50 instruments`);
