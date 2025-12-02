import { settingsService } from '@server/lib/services/settings';
import { Hono } from 'hono';

export const settingsRoute = new Hono().get('/sd-multiplier', async (c) => {
  const value = await settingsService.getSdMultiplier();
  return c.json({ value });
});
