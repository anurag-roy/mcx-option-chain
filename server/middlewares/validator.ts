import { zValidator as zv } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { type ZodType, z } from 'zod';

export const routeValidator = <T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zv(target, schema, (result, c) => {
    if (!result.success) {
      const message = z.prettifyError(result.error);
      throw new HTTPException(400, { message });
    }
  });
