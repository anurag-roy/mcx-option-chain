import { kiteService } from '@server/lib/services/kite';
import { writeFileSync } from 'node:fs';

const tradingSymbols = ['GOLD25DEC100000PE'];

console.log('Sending request for ', tradingSymbols.length, 'symbols');
console.time('Request');
const margins = await kiteService.orderMargins(
  tradingSymbols.map((symbol) => ({
    exchange: 'MCX',
    order_type: 'LIMIT',
    product: 'MIS',
    quantity: 1,
    tradingsymbol: symbol,
    transaction_type: 'SELL',
    variety: 'regular',
  })),
  'compact'
);
console.timeEnd('Request');
console.log('Got response for ', margins.length, 'symbols');
writeFileSync('margins.json', JSON.stringify(margins, null, 2));
