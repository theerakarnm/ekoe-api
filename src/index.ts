import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './core/config';
import { checkDbConnection } from './core/database';
import logger from './core/logger';
import { ResponseBuilder } from './core/response';
import { errorMiddleware } from './middleware/error.middleware';
import { loggerMiddleware } from './middleware/logger.middleware';
import { validateOrigin, securityHeaders } from './middleware/csrf.middleware';
import { initializePromptPayClient } from './libs/promptpay-client';
import router from './routes';

// Initialize payment clients
if (config.payment.promptpay.merchantId) {
  initializePromptPayClient({
    merchantId: config.payment.promptpay.merchantId,
  });
  logger.info('PromptPay client initialized');
} else {
  logger.warn('PromptPay merchant ID not configured');
}

const app = new Hono();

// Global Middleware
app.use('*', loggerMiddleware);
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'], // Frontend URLs
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use('*', securityHeaders);
app.use('*', validateOrigin(['http://localhost:3000', 'http://localhost:5173']));
app.use('*', errorMiddleware);

// Health Check
app.get('/health', async (c) => {
  const dbStatus = await checkDbConnection();
  return ResponseBuilder.success(c, {
    status: 'ok',
    database: dbStatus ? 'connected' : 'disconnected',
  });
});

// Routes
app.route('/api', router);

logger.info(`Server is running on port ${config.port}`);

export default {
  port: config.port,
  fetch: app.fetch,
};
