import { Context, Next } from 'hono';
import logger from '../core/logger';

export const loggerMiddleware = async (c: Context, next: Next) => {
  const start = Date.now();
  const { method, url } = c.req;
  
  logger.info({
    type: 'request',
    method,
    url,
  });

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  logger.info({
    type: 'response',
    method,
    url,
    status,
    duration: `${duration}ms`,
  });
};
