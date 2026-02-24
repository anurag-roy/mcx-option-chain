import { settingsService } from '@server/lib/services/settings';
import { routeValidator } from '@server/middlewares/validator';
import { CONFIG, type Symbol } from '@server/shared/config';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

const symbolSchema = z.enum(Object.keys(CONFIG) as [Symbol, ...Symbol[]]);

const updateCommoditySchema = z.object({
  vix: z.number().positive().optional(),
  bidBalance: z.number().min(0).optional(),
  multiplier: z.number().positive().optional(),
});

export const settingsRoute = new Hono()
  // SD Multiplier
  .get('/sd-multiplier', async (c) => {
    const value = await settingsService.getSdMultiplier();
    return c.json({ value });
  })

  // Get all commodity configs
  .get('/commodities', async (c) => {
    const configs = await settingsService.getAllCommodityConfigs();
    return c.json({ commodities: configs });
  })

  // Update commodity settings for a symbol
  .put(
    '/commodities/:symbol',
    routeValidator('param', z.object({ symbol: symbolSchema })),
    routeValidator('json', updateCommoditySchema),
    async (c) => {
      const { symbol } = c.req.valid('param');
      const updates = c.req.valid('json');

      // Validate that at least one field is being updated
      if (updates.vix === undefined && updates.bidBalance === undefined && updates.multiplier === undefined) {
        throw new HTTPException(400, { message: 'At least one field (vix, bidBalance, multiplier) must be provided' });
      }

      const result = await settingsService.updateCommodityConfig(symbol, updates);

      if (!result.success) {
        return c.json({ success: false, errors: result.errors }, 400);
      }

      // Return updated config
      const configs = await settingsService.getAllCommodityConfigs();
      const updatedConfig = configs.find((cfg) => cfg.symbol === symbol);

      return c.json({ success: true, commodity: updatedConfig });
    }
  );
