import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { AppError } from '../core/errors';
import logger from '../core/logger';
import { ResponseBuilder } from '../core/response';
import { ContentfulStatusCode } from 'hono/utils/http-status';

export const errorMiddleware = async (c: Context, next: Next) => {
  try {
    await next();
  } catch (err: any) {
    // Log error with details
    logger.error({
      error: err.message,
      stack: err.stack,
      url: c.req.url,
      method: c.req.method,
      cause: err.cause?.message,
    });

    // Handle Zod validation errors
    if (err instanceof ZodError) {
      const details = err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      }));

      return ResponseBuilder.error(
        c,
        'Validation failed',
        400,
        'VALIDATION_ERROR',
        details
      );
    }

    // Handle custom AppError
    if (err instanceof AppError) {
      return ResponseBuilder.error(
        c,
        err.message,
        err.statusCode as ContentfulStatusCode,
        err.code,
        err.details
      );
    }

    // Handle Hono HTTPException
    if (err instanceof HTTPException) {
      return ResponseBuilder.error(
        c,
        err.message,
        err.status,
        'HTTP_EXCEPTION'
      );
    }

    // Handle unknown errors
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';

    return ResponseBuilder.error(
      c,
      message,
      status,
      'INTERNAL_ERROR'
    );
  }
};
