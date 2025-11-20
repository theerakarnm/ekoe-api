import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

export const validateJson = (schema: z.ZodSchema) =>
  zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          message: 'Validation Error',
          errors: result.error.flatten(),
        },
        400
      );
    }
  });

export const validateParam = (schema: z.ZodSchema) =>
  zValidator('param', schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          message: 'Validation Error',
          errors: result.error.flatten(),
        },
        400
      );
    }
  });
