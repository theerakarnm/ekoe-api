import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const validateJson = (schema: z.ZodSchema) =>
  zValidator('json', schema, (result, c) => {
    console.log(result);

    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));

      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: c.req.header('x-request-id'),
          },
        },
        400
      );
    }
  });

export const validateParam = (schema: z.ZodSchema) =>
  zValidator('param', schema, (result, c) => {
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));

      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: c.req.header('x-request-id'),
          },
        },
        400
      );
    }
  });
