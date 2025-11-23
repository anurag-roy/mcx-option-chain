import { db } from '@server/db';
import { instruments } from '@server/db/schema';
import { logger } from '@server/lib/logger';
import { kiteService } from '@server/lib/services/kite';
import { VIX_MAP } from '@server/shared/config';
import { chunk } from 'es-toolkit';

const CHUNK_SIZE = 1_000;
const underlyingSymbols = Object.keys(VIX_MAP);
const instrumentTypes = ['CE', 'PE'];

const mcxInstruments = await kiteService.getInstruments(['MCX']);
const validInstruments = mcxInstruments.filter(
  (instrument) =>
    instrument.instrument_token &&
    underlyingSymbols.includes(instrument.name) &&
    instrumentTypes.includes(instrument.instrument_type)
);

logger.info(`Seeding ${validInstruments.length} MCX instruments`);

const instrumentsData = validInstruments.map((instrument) => ({
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
}));

const chunks = chunk(instrumentsData, CHUNK_SIZE);

await db.transaction(async (tx) => {
  await tx.delete(instruments);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    logger.info(`Inserting chunk ${i + 1}/${chunks.length} (${chunk.length} instruments)`);
    await tx.insert(instruments).values(chunk);
  }
});

logger.info(`Seeded ${validInstruments.length} MCX instruments`);
