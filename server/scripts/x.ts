import { setTimeout } from 'node:timers/promises';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const symbols = ['^GVZ', '^VXSLV', '^OVX'];
for (const symbol of symbols) {
  yahooFinance
    .quoteCombine(symbol, { fields: ['regularMarketPrice'] })
    .then((data) => {
      console.log('Data for symbol', symbol, data);
    })
    .catch((error) => {
      console.error('Failed to get data for symbol', symbol, error);
    });
}

await setTimeout(10_000);
