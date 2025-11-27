import { env } from '@server/lib/env';
import { accessToken } from '@server/lib/services/accessToken';
import { KiteConnect, type MarginOrder } from 'kiteconnect-ts';
import PQueue from 'p-queue';

const queue = new PQueue({
  interval: 1000,
  intervalCap: 10,
  carryoverIntervalCount: true,
});

export const kiteService = new KiteConnect({
  api_key: env.KITE_API_KEY,
  access_token: accessToken,
});

export const getOrderMargins = (orders: MarginOrder[]) => queue.add(() => kiteService.orderMargins(orders, 'compact'));
