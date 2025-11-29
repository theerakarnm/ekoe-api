import crypto from 'crypto';
import { logger } from '../core/logger';
import { ValidationError } from '../core/errors';

export interface TwoC2PConfig {
  merchantId: string;
  secretKey: string;
  apiUrl: string;
}

export interface CreatePaymentSessionParams {
  orderId: string;
  amount: number;
  currency: string;
  returnUrl: string;
}

export interface PaymentSessionResponse {
  paymentUrl: string;
  sessionId: string;
}

export class TwoC2PClient {
  private merchantId: string;
  private secretKey: string;
  private apiUrl: string;

  constructor(config: TwoC2PConfig) {
    if (!config.merchantId || !config.secretKey || !config.apiUrl) {
      throw new ValidationError('2C2P configuration is incomplete');
    }

    this.merchantId = config.merchantId;
    this.secretKey = config.secretKey;
    this.apiUrl = config.apiUrl;
  }

  /**
   * Generate HMAC-SHA256 hash for API requests and webhook verification
   */
  generateHash(data: string): string {
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(data)
      .digest('hex');
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: any, signature: string): boolean {
    try {
      // Construct data string in the same order as 2C2P expects
      const dataToHash = `${payload.merchant_id}${payload.order_id}${payload.payment_status}${payload.amount}${payload.currency}`;
      const expectedSignature = this.generateHash(dataToHash);

      // Use timing-safe comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error({ error }, 'Error verifying 2C2P webhook signature');
      return false;
    }
  }

  /**
   * Create payment session with 2C2P
   */
  async createPaymentSession(
    params: CreatePaymentSessionParams
  ): Promise<PaymentSessionResponse> {
    try {
      // Convert amount to string format (2 decimal places)
      const amountStr = (params.amount / 100).toFixed(2);

      // Generate hash for request authentication
      const dataToHash = `${this.merchantId}${params.orderId}${amountStr}${params.currency}`;
      const hash = this.generateHash(dataToHash);

      // Prepare request payload
      const requestPayload = {
        version: '1.0',
        merchant_id: this.merchantId,
        order_id: params.orderId,
        amount: amountStr,
        currency: params.currency,
        return_url: params.returnUrl,
        hash_value: hash,
      };

      logger.info(
        { orderId: params.orderId, amount: amountStr },
        'Creating 2C2P payment session'
      );

      // Make API request to 2C2P
      const response = await fetch(`${this.apiUrl}/payment/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          { status: response.status, error: errorText },
          '2C2P API request failed'
        );
        throw new Error(`2C2P API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as any;

      // Validate response
      if (!data.payment_url || !data.session_id) {
        logger.error({ data }, 'Invalid 2C2P API response');
        throw new Error('Invalid response from 2C2P API');
      }

      logger.info(
        { orderId: params.orderId, sessionId: data.session_id },
        '2C2P payment session created successfully'
      );

      return {
        paymentUrl: data.payment_url as string,
        sessionId: data.session_id as string,
      };
    } catch (error) {
      // Handle timeout errors
      if (error instanceof Error && error.name === 'TimeoutError') {
        logger.error(
          { orderId: params.orderId },
          '2C2P API request timed out'
        );
        throw new Error('Payment gateway timeout. Please try again.');
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        logger.error(
          { orderId: params.orderId, error },
          '2C2P API network error'
        );
        throw new Error('Unable to connect to payment gateway. Please try again.');
      }

      // Re-throw other errors
      logger.error(
        { orderId: params.orderId, error },
        'Error creating 2C2P payment session'
      );
      throw error;
    }
  }
}

// Singleton instance
let twoC2PClientInstance: TwoC2PClient | null = null;

/**
 * Get or create 2C2P client instance
 */
export function getTwoC2PClient(config?: TwoC2PConfig): TwoC2PClient {
  if (!twoC2PClientInstance) {
    if (!config) {
      throw new Error('2C2P client not initialized. Provide config on first call.');
    }
    twoC2PClientInstance = new TwoC2PClient(config);
  }
  return twoC2PClientInstance;
}

/**
 * Reset client instance (useful for testing)
 */
export function resetTwoC2PClient(): void {
  twoC2PClientInstance = null;
}
