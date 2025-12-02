import { kiteService } from '@server/lib/services/kite';

const userMargins = await kiteService.getMargins('equity');
console.log(JSON.stringify(userMargins, null, 2));

// {
// 	"segment": "EQUITY",
// 	"enabled": true,
// 	"net": 9331.698361999355,
// 	"available": {
// 	  "adhoc_margin": 0,
// 	  "cash": 0,
// 	  "opening_balance": 5316.5,
// 	  "live_balance": -401634.6764799999,
// 	  "collateral": 4693972.9113219995,
// 	  "intraday_payin": 0
// 	},
// 	"utilised": {
// 	  "debits": 4689957.71296,
// 	  "payout": 0,
// 	  "liquid_collateral": 1937657.6800000002,
// 	  "stock_collateral": 2756315.231322,
// 	  "span": 4520422.31296,
// 	  "exposure": 170275.4,
// 	  "additional": 0,
// 	  "delivery": 0,
// 	  "option_premium": -740,
// 	  "holding_sales": 0,
// 	  "turnover": 0,
// 	  "equity": 0,
// 	  "m2m_realised": 0,
// 	  "m2m_unrealised": 0
// 	}
// }
