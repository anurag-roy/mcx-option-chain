import { calculateBlack76, calculateFuturesMicroprice } from '@server/lib/utils/black76';
import { comparePricesAtTickSize, inferBuyerImpliedVolatility } from '@server/shared/black76';
import assert from 'node:assert/strict';
import test from 'node:test';

const tolerance = 1e-8;

test('matches the approved fixed Black-76 fixture', () => {
  const time = 18 / 252;
  const call = calculateBlack76(1_000, 1_000, 0.3, time, 'CE', 0.06);
  const put = calculateBlack76(1_000, 1_000, 0.3, time, 'PE', 0.06);

  assert.ok(call);
  assert.ok(put);
  assert.ok(Math.abs(call.fairPrice - 31.84122182) < tolerance);
  assert.ok(Math.abs(put.fairPrice - 31.84122182) < tolerance);
  assert.ok(Math.abs(call.delta - 0.51378234) < tolerance);
  assert.ok(Math.abs(put.delta - -0.48194112) < tolerance);
  assert.ok(Math.abs(call.fairPrice - put.fairPrice) < tolerance);
  assert.ok(Math.abs(35 - call.fairPrice - 3.15877818) < tolerance);
  assert.ok(Math.abs(((35 - call.fairPrice) / call.fairPrice) * 100 - 9.92040507) < tolerance);
});

test('satisfies put-call parity away from the money', () => {
  const futuresPrice = 1_050;
  const strikePrice = 1_000;
  const time = 45 / 252;
  const call = calculateBlack76(futuresPrice, strikePrice, 0.25, time, 'CE');
  const put = calculateBlack76(futuresPrice, strikePrice, 0.25, time, 'PE');

  assert.ok(call);
  assert.ok(put);
  assert.ok(Math.abs(call.fairPrice - put.fairPrice - call.discountFactor * (futuresPrice - strikePrice)) < tolerance);
  assert.ok(call.fairPrice >= 0 && call.fairPrice <= call.discountFactor * futuresPrice);
  assert.ok(put.fairPrice >= 0 && put.fairPrice <= put.discountFactor * strikePrice);
});

test('calculates the approved two-sided futures microprice', () => {
  assert.equal(calculateFuturesMicroprice(999.9, 1_200, 1_000.1, 1_200), 1_000);
  assert.equal(calculateFuturesMicroprice(1_001, 100, 1_000, 100), null);
  assert.equal(calculateFuturesMicroprice(999.9, 0, 1_000.1, 1_200), null);
});

test('rejects invalid Black-76 inputs', () => {
  assert.equal(calculateBlack76(0, 1_000, 0.3, 18 / 252, 'CE'), null);
  assert.equal(calculateBlack76(1_000, 1_000, 0, 18 / 252, 'CE'), null);
  assert.equal(calculateBlack76(1_000, 1_000, 0.3, 0, 'CE'), null);
});

test('compares Buyer 1 and fair value after individual tick rounding', () => {
  assert.equal(comparePricesAtTickSize(35, 31.84122182, 0.05), 'higher');
  assert.equal(comparePricesAtTickSize(31.84, 31.84122182, 0.05), 'equal');
  assert.equal(comparePricesAtTickSize(31.8, 31.84122182, 0.05), 'lower');
  assert.equal(comparePricesAtTickSize(31.8, 31.84, 0), null);
});

const silverFixtureTime = (2203 + 58 / 60) / 870 / 252;

test('matches the worked comparison normal-AV row and preserves the approved 7% calculation', () => {
  const fixtureNormal = calculateBlack76(197_871, 217_000, 0.4286, silverFixtureTime, 'CE', 0);
  const currentModel = calculateBlack76(197_871, 217_000, 0.4286, silverFixtureTime, 'CE');
  assert.ok(fixtureNormal);
  assert.ok(currentModel);
  assert.ok(Math.abs(fixtureNormal.fairPrice - 50.4673876783) < tolerance);
  assert.ok(Math.abs(fixtureNormal.delta - 0.016753272447) < tolerance);
  assert.ok(Math.abs(currentModel.fairPrice - 50.4318866202) < tolerance);
  assert.ok(Math.abs(currentModel.delta - 0.0167414874325) < tolerance);
  assert.ok(Math.abs(((164.5 - currentModel.fairPrice) / currentModel.fairPrice) * 100 - 226.1825226545) < tolerance);
});

test('independently infers the worked example Buyer IV and reprices Buyer 1', () => {
  const result = inferBuyerImpliedVolatility({
    futuresPrice: 197_871,
    strikePrice: 217_000,
    buyerPrice: 164.5,
    timeToExpiry: silverFixtureTime,
    discountFactor: 1,
    type: 'CE',
  });
  assert.equal(result.status, 'AVAILABLE');
  if (result.status !== 'AVAILABLE') return;
  assert.ok(Math.abs(result.expiryVolatility - 0.052036791177) < 1e-11);
  assert.ok(Math.abs(result.annualVolatility * 100 - 51.9000640646) < 1e-7);
  assert.ok(Math.abs(result.repricedBuyerPrice - 164.5) <= 1e-6);
});

test('solves calls and puts with the approved discounted production inputs', () => {
  for (const type of ['CE', 'PE'] as const) {
    const fair = calculateBlack76(1_050, 1_000, 0.4, 45 / 252, type);
    assert.ok(fair);
    const result = inferBuyerImpliedVolatility({
      futuresPrice: 1_050,
      strikePrice: 1_000,
      buyerPrice: fair.fairPrice,
      timeToExpiry: 45 / 252,
      discountFactor: fair.discountFactor,
      type,
    });
    assert.equal(result.status, 'AVAILABLE');
    if (result.status !== 'AVAILABLE') continue;
    assert.ok(Math.abs(result.annualVolatility - 0.4) < tolerance);
    assert.ok(Math.abs(result.repricedBuyerPrice - fair.fairPrice) <= 1e-6);
  }
});

test('unavailable Buyer IV does not invalidate an independent model price', () => {
  const model = calculateBlack76(1_050, 1_000, 0.4, 45 / 252, 'CE');
  assert.ok(model);
  const inputs = {
    futuresPrice: 1_050,
    strikePrice: 1_000,
    buyerPrice: 100,
    timeToExpiry: 45 / 252,
    discountFactor: model.discountFactor,
    type: 'CE' as const,
  };
  const unavailable = { status: 'IV_UNAVAILABLE' };
  for (const buyerPrice of [0, -1, NaN, Infinity, model.discountFactor * 49, model.discountFactor * 1_050]) {
    assert.deepEqual(inferBuyerImpliedVolatility({ ...inputs, buyerPrice }), unavailable);
  }
  assert.deepEqual(inferBuyerImpliedVolatility({ ...inputs, futuresPrice: NaN }), unavailable);
  assert.deepEqual(inferBuyerImpliedVolatility({ ...inputs, timeToExpiry: 0 }), unavailable);
  assert.deepEqual(inferBuyerImpliedVolatility({ ...inputs, discountFactor: 0 }), unavailable);
  assert.deepEqual(calculateBlack76(1_050, 1_000, 0.4, 45 / 252, 'CE'), model);
});
