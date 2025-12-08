import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './core/config';
import { paymentConfig, isPromptPayConfigured } from './core/config/payment.config';
import { checkDbConnection } from './core/database';
import logger from './core/logger';
import { ResponseBuilder } from './core/response';
import { errorMiddleware, errorHandler } from './middleware/error.middleware';
import { loggerMiddleware } from './middleware/logger.middleware';
import { validateOrigin, securityHeaders } from './middleware/csrf.middleware';
import { initializePromptPayClient } from './libs/promptpay-client';
import router from './routes';

// Initialize payment clients
if (isPromptPayConfigured()) {
  initializePromptPayClient({
    merchantId: paymentConfig.promptpay.merchantId,
  });
  logger.info('PromptPay client initialized');
} else {
  logger.warn('PromptPay merchant ID not configured');
}

const app = new Hono();

// Global Middleware
app.use('*', loggerMiddleware);
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'https://qas-ekoe.theerakarnm.dev'], // Frontend URLs
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use('*', securityHeaders);
app.use('*', validateOrigin(['http://localhost:3000', 'http://localhost:5173', 'https://qas-ekoe.theerakarnm.dev']));
app.use('*', errorMiddleware);

// Error Handler
app.onError(errorHandler);

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

export { app };

export default {
  port: config.port,
  fetch: app.fetch,
};
