export const BLACK_76_RISK_FREE_RATE = 0.07;

export type Black76OptionType = 'CE' | 'PE';

export type Black76Result = {
  fairPrice: number;
  delta: number;
  discountFactor: number;
  d1: number;
  d2: number;
};

const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);

export function normalCdf(value: number): number {
  if (value <= -8) return 0;
  if (value >= 8) return 1;

  const x = Math.abs(value);
  let term = x;
  let sum = x;

  for (let index = 1; index < 200; index++) {
    term *= (x * x) / (2 * index + 1);
    sum += term;
    if (term <= sum * Number.EPSILON) break;
  }

  const positiveCdf = 0.5 + (Math.exp((-x * x) / 2) * sum) / SQRT_TWO_PI;
  return value < 0 ? 1 - positiveCdf : positiveCdf;
}

export function calculateFuturesMicroprice(
  bidPrice: number,
  bidQuantity: number,
  askPrice: number,
  askQuantity: number
): number | null {
  if (
    !Number.isFinite(bidPrice) ||
    !Number.isFinite(bidQuantity) ||
    !Number.isFinite(askPrice) ||
    !Number.isFinite(askQuantity) ||
    bidPrice <= 0 ||
    askPrice <= 0 ||
    bidQuantity <= 0 ||
    askQuantity <= 0 ||
    bidPrice > askPrice
  ) {
    return null;
  }

  return (askPrice * bidQuantity + bidPrice * askQuantity) / (bidQuantity + askQuantity);
}

/** Price using an already expiry-adjusted volatility and an explicit discount factor. */
export function calculateBlack76FromExpiryVolatility(
  futuresPrice: number,
  strikePrice: number,
  expiryVolatility: number,
  type: Black76OptionType,
  discountFactor: number
): Black76Result | null {
  if (
    ![futuresPrice, strikePrice, expiryVolatility, discountFactor].every(Number.isFinite) ||
    futuresPrice <= 0 ||
    strikePrice <= 0 ||
    expiryVolatility <= 0 ||
    discountFactor <= 0 ||
    (type !== 'CE' && type !== 'PE')
  ) {
    return null;
  }

  const d1 = Math.log(futuresPrice / strikePrice) / expiryVolatility + 0.5 * expiryVolatility;
  const d2 = d1 - expiryVolatility;
  const nd1 = normalCdf(d1);
  const fairPrice =
    type === 'CE'
      ? discountFactor * (futuresPrice * nd1 - strikePrice * normalCdf(d2))
      : discountFactor * (strikePrice * normalCdf(-d2) - futuresPrice * normalCdf(-d1));
  const delta = type === 'CE' ? discountFactor * nd1 : -discountFactor * normalCdf(-d1);

  if (![fairPrice, delta, discountFactor, d1, d2].every(Number.isFinite) || fairPrice < 0) {
    return null;
  }

  return { fairPrice, delta, discountFactor, d1, d2 };
}

/** Preserve the scanner's annual-AV, time-clock, and 7% discounting policy. */
export function calculateBlack76(
  futuresPrice: number,
  strikePrice: number,
  volatility: number,
  timeToExpiry: number,
  type: Black76OptionType,
  riskFreeRate = BLACK_76_RISK_FREE_RATE
): Black76Result | null {
  if (![volatility, timeToExpiry, riskFreeRate].every(Number.isFinite) || volatility <= 0 || timeToExpiry <= 0) {
    return null;
  }

  return calculateBlack76FromExpiryVolatility(
    futuresPrice,
    strikePrice,
    volatility * Math.sqrt(timeToExpiry),
    type,
    Math.exp(-riskFreeRate * timeToExpiry)
  );
}

export type BuyerIvInputs = {
  futuresPrice: number;
  strikePrice: number;
  buyerPrice: number;
  timeToExpiry: number;
  discountFactor: number;
  type: Black76OptionType;
};

export type BuyerIvResult =
  | {
      status: 'AVAILABLE';
      expiryVolatility: number;
      annualVolatility: number;
      repricedBuyerPrice: number;
    }
  | { status: 'IV_UNAVAILABLE' };

/** Bid-implied IV is diagnostic only; it is never an input to the independent fair price. */
export function inferBuyerImpliedVolatility({
  futuresPrice,
  strikePrice,
  buyerPrice,
  timeToExpiry,
  discountFactor,
  type,
}: BuyerIvInputs): BuyerIvResult {
  const unavailable = { status: 'IV_UNAVAILABLE' } as const;
  if (
    ![futuresPrice, strikePrice, buyerPrice, timeToExpiry, discountFactor].every(Number.isFinite) ||
    futuresPrice <= 0 ||
    strikePrice <= 0 ||
    buyerPrice <= 0 ||
    timeToExpiry <= 0 ||
    discountFactor <= 0 ||
    (type !== 'CE' && type !== 'PE')
  ) {
    return unavailable;
  }

  const lowerBound =
    discountFactor * Math.max(type === 'CE' ? futuresPrice - strikePrice : strikePrice - futuresPrice, 0);
  const upperBound = discountFactor * (type === 'CE' ? futuresPrice : strikePrice);
  // At either bound there is no unique, finite, strictly positive IV solution.
  if (!Number.isFinite(upperBound) || buyerPrice <= lowerBound || buyerPrice >= upperBound) return unavailable;

  const priceAt = (volatility: number) =>
    calculateBlack76FromExpiryVolatility(futuresPrice, strikePrice, volatility, type, discountFactor);
  let lowerVolatility = 0;
  let upperVolatility = 0.25;
  let upperResult = priceAt(upperVolatility);
  while (upperResult && upperResult.fairPrice < buyerPrice && upperVolatility < 32) {
    upperVolatility *= 2;
    upperResult = priceAt(upperVolatility);
  }
  if (!upperResult || upperResult.fairPrice < buyerPrice) return unavailable;

  const priceTolerance = Math.max(1e-8, Number.EPSILON * upperBound * 8);
  for (let iteration = 0; iteration < 128; iteration++) {
    const expiryVolatility = (lowerVolatility + upperVolatility) / 2;
    const result = priceAt(expiryVolatility);
    if (!result) return unavailable;

    const difference = result.fairPrice - buyerPrice;
    if (Math.abs(difference) <= priceTolerance) {
      const annualVolatility = expiryVolatility / Math.sqrt(timeToExpiry);
      if (!Number.isFinite(annualVolatility)) return unavailable;
      return {
        status: 'AVAILABLE',
        expiryVolatility,
        annualVolatility,
        repricedBuyerPrice: result.fairPrice,
      };
    }

    if (difference < 0) lowerVolatility = expiryVolatility;
    else upperVolatility = expiryVolatility;
  }

  return unavailable;
}

export type TickPriceComparison = 'higher' | 'lower' | 'equal';

export function comparePricesAtTickSize(
  buyerPrice: number,
  fairPrice: number,
  tickSize: number
): TickPriceComparison | null {
  if (
    !Number.isFinite(buyerPrice) ||
    !Number.isFinite(fairPrice) ||
    !Number.isFinite(tickSize) ||
    buyerPrice < 0 ||
    fairPrice < 0 ||
    tickSize <= 0
  ) {
    return null;
  }

  const buyerTicks = Math.round(buyerPrice / tickSize);
  const fairTicks = Math.round(fairPrice / tickSize);
  if (buyerTicks === fairTicks) return 'equal';
  return buyerTicks > fairTicks ? 'higher' : 'lower';
}
