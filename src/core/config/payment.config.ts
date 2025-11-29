/**
 * Payment Configuration Module
 * 
 * Loads and validates payment provider configuration from environment variables.
 * Supports PromptPay (Thailand's national payment system) and 2C2P (credit card gateway).
 */

import { z } from 'zod';

/**
 * Payment configuration schema with validation rules
 * In test mode, allows empty strings for credentials
 */
const isTestMode = process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test';

const paymentConfigSchema = z.object({
  promptpay: z.object({
    merchantId: isTestMode ? z.string() : z.string().min(1, 'PromptPay merchant ID is required'),
    webhookSecret: isTestMode ? z.string() : z.string().min(1, 'PromptPay webhook secret is required'),
  }),
  twoC2P: z.object({
    merchantId: isTestMode ? z.string() : z.string().min(1, '2C2P merchant ID is required'),
    secretKey: isTestMode ? z.string() : z.string().min(1, '2C2P secret key is required'),
    apiUrl: z.string().url('2C2P API URL must be a valid URL').default('https://api.2c2p.com'),
    webhookSecret: isTestMode ? z.string() : z.string().min(1, '2C2P webhook secret is required'),
  }),
  settings: z.object({
    qrExpiryMinutes: z.number().int().positive().default(15),
    pollingIntervalMs: z.number().int().positive().default(5000),
    maxRetryAttempts: z.number().int().positive().default(3),
  }),
});

/**
 * Payment configuration type
 */
export type PaymentConfig = z.infer<typeof paymentConfigSchema>;

/**
 * Load payment configuration from environment variables
 */
function loadPaymentConfig(): PaymentConfig {
  const rawConfig = {
    promptpay: {
      merchantId: process.env.PROMPTPAY_MERCHANT_ID || '',
      webhookSecret: process.env.PROMPTPAY_WEBHOOK_SECRET || '',
    },
    twoC2P: {
      merchantId: process.env.TWOC2P_MERCHANT_ID || '',
      secretKey: process.env.TWOC2P_SECRET_KEY || '',
      apiUrl: process.env.TWOC2P_API_URL || 'https://api.2c2p.com',
      webhookSecret: process.env.TWOC2P_WEBHOOK_SECRET || '',
    },
    settings: {
      qrExpiryMinutes: Number(process.env.PAYMENT_QR_EXPIRY_MINUTES) || 15,
      pollingIntervalMs: Number(process.env.PAYMENT_POLLING_INTERVAL_MS) || 5000,
      maxRetryAttempts: Number(process.env.PAYMENT_MAX_RETRY_ATTEMPTS) || 3,
    },
  };

  // Validate configuration
  const result = paymentConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
    throw new Error(`Payment configuration validation failed: ${errors}`);
  }

  return result.data;
}

/**
 * Validated payment configuration object
 * 
 * @throws {Error} If required environment variables are missing or invalid
 */
export const paymentConfig = loadPaymentConfig();

/**
 * Helper function to check if payment providers are configured
 */
export function isPromptPayConfigured(): boolean {
  return !!(paymentConfig.promptpay.merchantId && paymentConfig.promptpay.webhookSecret);
}

export function is2C2PConfigured(): boolean {
  return !!(
    paymentConfig.twoC2P.merchantId &&
    paymentConfig.twoC2P.secretKey &&
    paymentConfig.twoC2P.webhookSecret
  );
}

/**
 * Get payment expiry time in milliseconds
 */
export function getPaymentExpiryMs(): number {
  return paymentConfig.settings.qrExpiryMinutes * 60 * 1000;
}

/**
 * Get payment expiry date from now
 */
export function getPaymentExpiryDate(): Date {
  return new Date(Date.now() + getPaymentExpiryMs());
}
