import type { instrumentsTable } from '@server/db/schema';
import type { Symbol } from '@server/shared/config';
import type { CoordinatorMessage } from '@server/worker';
import type { OptionChain } from '@shared/types/types';
import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import { after, afterEach, mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';

// These tests use an isolated database and never connect to Kite or Yahoo.
Object.assign(process.env, {
  PORT: '0',
  DATABASE_URL: 'file::memory:',
  KITE_USER_ID: 'test',
  KITE_PASSWORD: 'test',
  KITE_API_KEY: 'test',
  KITE_API_SECRET: 'test',
  KITE_TOTP_SECRET: 'test',
});

const { sql } = await import('drizzle-orm');
const { db, closeDb } = await import('@server/db');
const { settingsService } = await import('@server/lib/services/settings');
const { volatilityService } = await import('@server/lib/services/volatility');
const { workingDaysCache } = await import('@server/lib/market-minutes-cache');
const { TickerService } = await import('@server/lib/services/ticker');
const { updateWorkerVix } = await import('@server/lib/update-worker-vix');
const { settingsRoute } = await import('@server/routes/settings');

await db.run(sql`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
after(closeDb);
afterEach(() => {
  mock.restoreAll();
  settingsService.setVixUpdateCallback(async () => {});
  volatilityService.setUpdateCallback(() => {});
  volatilityService.values = {};
});

function createWorker(send: (message: CoordinatorMessage, callback: (error: Error | null) => void) => boolean) {
  const worker = new ChildProcess();
  worker.send = send as typeof worker.send;
  return worker;
}

test('volatility keeps refreshing beyond the first two minutes', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  let value = 20;
  const reads = mock.method(settingsService, 'getVix', async () => value);
  mock.method(workingDaysCache, 'getDvFromAv', (av: number) => av / 100);
  volatilityService.setSymbolsFilter(['COPPER']);
  await volatilityService.init();
  assert.equal(volatilityService.values.COPPER?.av, 20);

  for (value of [30, 40, 50]) {
    t.mock.timers.tick(120_000);
    await setImmediate();
    assert.deepEqual(volatilityService.values.COPPER, { av: value, dv: value / 100 });
  }
  assert.equal(reads.mock.callCount(), 4);
});

test('an old background read cannot overwrite a newer saved VIX', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  let finishRead!: (value: number) => void;
  mock.method(settingsService, 'getVix', () => new Promise<number>((resolve) => (finishRead = resolve)));
  mock.method(workingDaysCache, 'getDvFromAv', (av: number) => av / 100);
  volatilityService.setSymbolsFilter(['COPPER']);

  const initialization = volatilityService.init();
  volatilityService.updateVix('COPPER', 80);
  finishRead(20);
  await initialization;
  assert.deepEqual(volatilityService.values.COPPER, { av: 80, dv: 0.8 });
});

test('saving VIX refreshes calculations and option subscriptions without a futures tick', async () => {
  mock.method(workingDaysCache, 'getMarketMinutesInLastYear', () => 10_000);
  mock.method(workingDaysCache, 'getMarketMinutesTillExpiry', () => 100);
  const ticker = new TickerService();
  type Instrument = typeof instrumentsTable.$inferSelect;
  const state = ticker as unknown as {
    ticker: { subscribe: (tokens: number[]) => void; unsubscribe: (tokens: number[]) => void; setMode: () => void };
    futureLtps: Record<string, Record<string, number>>;
    futureReferencePrices: Record<string, Record<string, number | null>>;
    optionInstrumentsBySymbol: Map<Symbol, Map<string, Instrument[]>>;
    optionChain: Record<number, OptionChain>;
    calculateOptions: () => OptionChain[];
  };
  const subscriptions = mock.method(state.ticker, 'subscribe', () => {});
  const unsubscriptions = mock.method(state.ticker, 'unsubscribe', () => {});
  mock.method(state.ticker, 'setMode', () => {});
  const expiry = '2027-01-15';
  const futureExpiry = '2027-01-28';
  const instruments: Instrument[] = [];
  for (const instrumentType of ['CE', 'PE'] as const) {
    for (let strike = 80; strike <= 120; strike += 5) {
      instruments.push({
        instrumentToken: instruments.length + 1,
        exchangeToken: String(instruments.length + 1),
        tradingsymbol: `COPPER${strike}${instrumentType}`,
        name: 'COPPER',
        expiry,
        strike,
        tickSize: 0.01,
        lotSize: 1,
        instrumentType,
        segment: 'MCX-OPT',
        exchange: 'MCX',
      });
    }
  }
  state.futureLtps = { COPPER: { [futureExpiry]: 100 } };
  state.futureReferencePrices = { COPPER: { [futureExpiry]: 100 } };
  state.optionInstrumentsBySymbol.set('COPPER', new Map([[expiry, instruments]]));
  ticker.setSymbolsFilter(['COPPER']);
  volatilityService.setUpdateCallback((symbol) => ticker.refreshVolatility(symbol));
  volatilityService.updateVix('COPPER', 20);
  await ticker.subscribeAll(2.05);
  const initialTokens = Object.keys(state.optionChain).sort();
  const initialOption = state.calculateOptions();
  assert.equal(initialOption.length, 0); // No market bids in this fixture.
  const retainedOption = Object.values(state.optionChain).find((option) => option.strike === 120)!;
  const initialDelta = retainedOption.delta;

  const worker = createWorker((message, callback) => {
    assert.equal(message.type, 'updateVix');
    if (message.type === 'updateVix') {
      queueMicrotask(() => {
        volatilityService.updateVix(message.symbol, message.value);
        worker.emit('message', { type: 'vixUpdated', requestId: message.requestId });
      });
    }
    callback(null);
    return true;
  });
  settingsService.setVixUpdateCallback((symbol, value) => updateWorkerVix(worker, symbol, value));
  const save = (value: number) =>
    settingsRoute.request('/commodities/COPPER', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vix: value }),
    });

  const response = await save(80);
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as { success: boolean }).success, true);
  assert.equal(await settingsService.getVix('COPPER'), 80);
  assert.deepEqual(volatilityService.values.COPPER, { av: 80, dv: 0.8 });
  assert.equal(Object.keys(state.optionChain).length, 2);
  assert.equal(unsubscriptions.mock.callCount(), 1);
  state.calculateOptions();
  assert.equal(retainedOption.av, 80);
  assert.equal(retainedOption.sd, 8);
  assert.notEqual(retainedOption.delta, initialDelta);

  // A second edit expands the range immediately, with the futures price unchanged.
  assert.equal((await save(20)).status, 200);
  assert.deepEqual(Object.keys(state.optionChain).sort(), initialTokens);
  assert.equal(subscriptions.mock.callCount(), 2);
  assert.equal(state.futureLtps.COPPER?.[futureExpiry], 100);
});

test('all editable commodities accept live updates independently', async () => {
  mock.method(workingDaysCache, 'getDvFromAv', (av: number) => av / 100);
  for (const [index, symbol] of (['NATURALGAS', 'NATGASMINI', 'COPPER', 'ZINC'] as const).entries()) {
    volatilityService.updateVix(symbol, 30 + index);
  }
  assert.equal(volatilityService.values.NATURALGAS?.av, 30);
  assert.equal(volatilityService.values.NATGASMINI?.av, 31);
  assert.equal(volatilityService.values.COPPER?.av, 32);
  assert.equal(volatilityService.values.ZINC?.av, 33);
  assert.throws(() => volatilityService.updateVix('GOLD', 40), /not updatable/);
  assert.throws(() => volatilityService.updateVix('COPPER', NaN), /finite positive/);
});

test('a send callback alone cannot report success before the worker applies VIX', async () => {
  let requestId = '';
  const worker = createWorker((message, callback) => {
    if (message.type === 'updateVix') requestId = message.requestId;
    callback(null);
    return true;
  });
  let finished = false;
  const update = updateWorkerVix(worker, 'COPPER', 80).then(() => (finished = true));
  await setImmediate();
  assert.equal(finished, false);
  worker.emit('message', { type: 'vixUpdated', requestId: 'another-request' });
  await setImmediate();
  assert.equal(finished, false);
  worker.emit('message', { type: 'vixUpdated', requestId });
  await update;
  assert.equal(finished, true);
  assert.equal(worker.listenerCount('message'), 0);
  assert.equal(worker.listenerCount('exit'), 0);
  assert.equal(worker.listenerCount('error'), 0);
});

test('a worker failure rejects the save instead of reporting success', async () => {
  const worker = createWorker((message, callback) => {
    callback(null);
    queueMicrotask(() => {
      if (message.type === 'updateVix') {
        worker.emit('message', { type: 'vixUpdated', requestId: message.requestId, error: 'Could not apply VIX' });
      }
    });
    return true;
  });
  await assert.rejects(updateWorkerVix(worker, 'COPPER', 80), /Could not apply VIX/);
  assert.equal(worker.listenerCount('message'), 0);
});

test('unresponsive workers time out and release their listeners', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const worker = createWorker(() => true);
  const rejected = assert.rejects(updateWorkerVix(worker, 'COPPER', 80), /timed out/);
  t.mock.timers.tick(5000);
  await rejected;
  assert.equal(worker.listenerCount('message'), 0);
});
