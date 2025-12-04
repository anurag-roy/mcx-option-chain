import { logger } from '@server/lib/logger';
import { kiteService } from '@server/lib/services/kite';
import { routeValidator } from '@server/middlewares/validator';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { PlaceOrderParams } from 'kiteconnect-ts';
import { z } from 'zod';

const placeOrderSchema = z.object({
  tradingsymbol: z.string(),
  price: z.number().positive(),
  quantity: z.number().int().positive(),
});

export const ordersRoute = new Hono()
  // Place a sell order
  .post('/sell', routeValidator('json', placeOrderSchema), async (c) => {
    const { tradingsymbol, price, quantity } = c.req.valid('json');

    try {
      const placeOrderParams: PlaceOrderParams = {
        exchange: 'MCX',
        tradingsymbol,
        transaction_type: 'SELL',
        quantity,
        product: 'NRML',
        order_type: 'LIMIT',
        price,
      };
      logger.info('Placing order:', placeOrderParams);
      const result = await kiteService.placeOrder('regular', placeOrderParams);

      logger.info(`Order placed successfully: ${result.order_id} for ${tradingsymbol}`);

      return c.json({
        success: true,
        order_id: result.order_id,
      });
    } catch (error) {
      logger.error('Error placing order:', error);

      if (error instanceof Error) {
        throw new HTTPException(400, { message: `Failed to place order: ${error.message}` });
      }

      throw new HTTPException(500, { message: 'Failed to place order' });
    }
  });
