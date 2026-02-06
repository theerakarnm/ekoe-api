import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { logger } from '../core/logger';
import { ValidationError } from '../core/errors';
import dayjs from 'dayjs';

export interface TwoC2PConfig {
  merchantId: string;
  secretKey: string;
  apiUrl: string;
  backendReturnUrl: string;
}

export interface CreatePaymentSessionParams {
  orderId: string;
  userId: string;
  amount: number | string;
  currency: string;
  returnUrl: string;
  description?: string;
}

export interface PaymentSessionResponse {
  paymentUrl: string;
  sessionId: string;
  meta: {
    invoiceNo: string;
  };
}

interface PaymentTokenPayload {
  merchantID: string;
  invoiceNo: string;
  description: string;
  amount: number | string;
  currencyCode: string;
  paymentChannel: string[];
  backendReturnUrl?: string;
  frontendReturnUrl?: string;
  userDefined1?: string;
  userDefined2?: string;
  userDefined3?: string;
  userDefined4?: string;
  userDefined5?: string;
  nonceStr?: string;
  iat?: number;
}

interface PaymentTokenResponse {
  respCode: string;
  respDesc: string;
  webPaymentUrl?: string;
  paymentToken?: string;
}

export class TwoC2PClient {
  private merchantId: string;
  private secretKey: string;
  private apiUrl: string;
  private backendReturnUrl: string;

  constructor(config: TwoC2PConfig) {
    if (!config.merchantId || !config.secretKey || !config.apiUrl) {
      throw new ValidationError('2C2P configuration is incomplete');
    }

    this.merchantId = config.merchantId;
    this.secretKey = config.secretKey;
    this.backendReturnUrl = config.backendReturnUrl;
    // Normalize API URL (remove trailing slash if present)
    this.apiUrl = config.apiUrl.replace(/\/$/, '');
  }

  /**
   * Generate JWT payload for 2C2P API requests
   * Uses HS256 algorithm as required by PGW v4.3
   */
  private generateJwtPayload(payload: object): string {
    // Use secret key directly - 2C2P secret keys are typically plain strings
    return jwt.sign(payload, this.secretKey, { algorithm: 'HS256' });
  }

  /**
   * Decode JWT response from 2C2P API
   */
  private decodeJwtResponse(token: string): PaymentTokenResponse {
    // Log the raw token for debugging
    logger.debug({ token: token?.substring(0, 100) + '...' }, 'Attempting to decode 2C2P JWT response');

    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded === 'string') {
      logger.error({ rawToken: token, decodedValue: decoded }, 'Failed to decode JWT response from 2C2P');
      throw new Error('Invalid JWT response from 2C2P');
    }
    return decoded as PaymentTokenResponse;
  }

  /**
   * Verify and decode webhook payload from 2C2P backend notification
   */
  verifyWebhookPayload(jwtPayload: string): Record<string, unknown> | null {
    try {
      // Verify the JWT using the secret key
      const decoded = jwt.verify(jwtPayload, this.secretKey, { algorithms: ['HS256'] });
      if (typeof decoded === 'string') {
        return null;
      }
      return decoded as Record<string, unknown>;
    } catch (error) {
      logger.error({ error }, 'Error verifying 2C2P webhook payload');
      return null;
    }
  }

  /**
   * Create payment session with 2C2P PGW v4.3
   * 
   * This method follows the PGW v4.3 Payment Token API specification:
   * 1. Creates a JWT-signed payload with transaction details
   * 2. POSTs to /payment/4.3/paymentToken endpoint
   * 3. Decodes the JWT response to get webPaymentUrl
   */
  async createPaymentSession(
    params: CreatePaymentSessionParams
  ): Promise<PaymentSessionResponse> {
    try {
      // Convert amount to number format (2C2P expects amount in decimal)
      // If amount is in cents (smallest unit), convert to decimal
      const amountDecimal = Number(params.amount) / 100;

      // Generate unique nonce for this request
      const nonceStr = crypto.randomBytes(8).toString('hex');
      const randStr = crypto.randomBytes(4).toString('hex');

      const invNo = `${dayjs().format('YYYYMM')}-${randStr}`

      // Prepare JWT payload for Payment Token API
      const tokenPayload: PaymentTokenPayload = {
        merchantID: this.merchantId,
        invoiceNo: invNo,
        description: params.description || `Order ${invNo}`,
        amount: amountDecimal, // Format as string with 2 decimal places (e.g., "100.00")
        currencyCode: params.currency,
        paymentChannel: ['CC', 'PPQR'],
        nonceStr: nonceStr,
        userDefined1: params.orderId,
        userDefined2: params.userId,
        frontendReturnUrl: params.returnUrl,
        backendReturnUrl: this.backendReturnUrl,
      };

      logger.info(
        {
          orderId: params.orderId,
          amount: amountDecimal,
          currency: params.currency
        },
        'Creating 2C2P payment session'
      );

      // Generate JWT-signed payload
      const jwtToken = this.generateJwtPayload(tokenPayload);

      // Construct the full API URL for Payment Token endpoint
      // apiUrl should be base URL like https://sandbox-pgw.2c2p.com
      // We need to append /payment/4.3/paymentToken
      let apiEndpoint = this.apiUrl;
      if (!apiEndpoint.includes('/payment/')) {
        apiEndpoint = `${this.apiUrl}/payment/4.3/paymentToken`;
      }

      logger.info({ apiEndpoint, merchantId: this.merchantId }, 'Making 2C2P Payment Token API request');

      // Make API request to 2C2P Payment Token endpoint
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload: jwtToken }),
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

      const responseData = await response.json() as { payload: string };

      // Log raw response for debugging
      logger.info({ rawPayload: responseData.payload?.substring(0, 200) }, '2C2P raw response payload');

      // Decode JWT response
      const decodedResponse = this.decodeJwtResponse(responseData.payload);

      // Check response code (0000 = success)
      if (decodedResponse.respCode !== '0000') {
        logger.error(
          {
            respCode: decodedResponse.respCode,
            respDesc: decodedResponse.respDesc
          },
          '2C2P payment token request failed'
        );
        throw new Error(`2C2P error: ${decodedResponse.respCode} - ${decodedResponse.respDesc}`);
      }

      // Validate response contains required fields
      if (!decodedResponse.webPaymentUrl || !decodedResponse.paymentToken) {
        logger.error({ response: decodedResponse }, 'Invalid 2C2P API response');
        throw new Error('Invalid response from 2C2P API: missing payment URL or token');
      }

      logger.info(
        { orderId: params.orderId, paymentToken: decodedResponse.paymentToken },
        '2C2P payment session created successfully'
      );

      return {
        paymentUrl: decodedResponse.webPaymentUrl,
        sessionId: decodedResponse.paymentToken,
        meta: {
          invoiceNo: invNo,
        }
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