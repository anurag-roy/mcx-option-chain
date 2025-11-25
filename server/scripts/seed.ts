import { db } from '@server/db';
import { holidaysTable, instrumentsTable } from '@server/db/schema';
import { logger } from '@server/lib/logger';
import { kiteService } from '@server/lib/services/kite';
import { CONFIG } from '@server/shared/config';
import { format, parse } from 'date-fns';
import { chunk } from 'es-toolkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function seedInstruments() {
  const CHUNK_SIZE = 1_000;
  const underlyingSymbols = Object.keys(CONFIG);
  const instrumentTypes = ['FUT', 'CE', 'PE'];

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
    expiry: instrument.expiry.toISOString().split('T')[0]!,
    strike: instrument.strike,
    tickSize: instrument.tick_size,
    lotSize: instrument.lot_size,
    instrumentType: instrument.instrument_type,
    segment: instrument.segment,
    exchange: instrument.exchange,
  }));

  const chunks = chunk(instrumentsData, CHUNK_SIZE);

  await db.transaction(async (tx) => {
    await tx.delete(instrumentsTable);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      logger.info(`Inserting chunk ${i + 1}/${chunks.length} (${chunk.length} instruments)`);
      await tx.insert(instrumentsTable).values(chunk);
    }
  });

  logger.info(`Seeded ${validInstruments.length} MCX instruments`);
}

async function seedHolidays() {
  // Read the MCX holidays CSV file
  const csvPath = join(process.cwd(), '.data', 'mcx_holidays.csv');
  const csvContent = readFileSync(csvPath, 'utf-8');

  // Parse CSV (skip header: date,holiday,type)
  const lines = csvContent.trim().split('\n').slice(1);
  const holidaysData: (typeof holidaysTable.$inferInsert)[] = [];

  for (const line of lines) {
    const [dateStr, name, type] = line.split(',');
    if (!dateStr || !name || !type) continue;

    // Parse the date from DD-MMM-YYYY format to proper Date
    const parsedDate = parse(dateStr, 'dd-MMM-yyyy', new Date());

    // Format as YYYY-MM-DD for database storage
    const formattedDate = format(parsedDate, 'yyyy-MM-dd');

    // Validate type
    const holidayType = type.trim() as 'morning' | 'evening' | 'full';
    if (!['morning', 'evening', 'full'].includes(holidayType)) {
      logger.warn(`Invalid holiday type "${type}" for ${dateStr}, skipping...`);
      continue;
    }

    holidaysData.push({
      date: formattedDate,
      name: name.trim(),
      type: holidayType,
      year: parsedDate.getFullYear(),
      month: parsedDate.getMonth() + 1, // getMonth() returns 0-11
      day: parsedDate.getDate(),
    });
  }

  logger.info(`Seeding ${holidaysData.length} MCX holidays`);

  await db.transaction(async (tx) => {
    await tx.delete(holidaysTable);
    await tx.insert(holidaysTable).values(holidaysData);
  });

  logger.info(`Seeded ${holidaysData.length} MCX holidays`);
}

await seedInstruments();
await seedHolidays();
