import generatePayload from 'promptpay-qr';
import QRCode from 'qrcode';
import { logger } from '../core/logger';

export interface PromptPayConfig {
  merchantId: string;
}

export class PromptPayClient {
  private merchantId: string;

  constructor(config: PromptPayConfig) {
    this.merchantId = config.merchantId;
  }

  /**
   * Generate PromptPay EMV QR payload
   * @param amount - Payment amount in THB
   * @param referenceId - Unique reference ID for the payment
   * @returns EMV QR payload string
   */
  generatePayload(amount: number, referenceId: string): string {
    try {
      // Generate PromptPay QR payload using the library
      // The library expects amount in THB (not cents)
      const payload = generatePayload(this.merchantId, { amount });
      
      logger.debug(
        { merchantId: this.merchantId, amount, referenceId },
        'Generated PromptPay payload'
      );

      return payload;
    } catch (error) {
      logger.error(
        { error, merchantId: this.merchantId, amount, referenceId },
        'Failed to generate PromptPay payload'
      );
      throw new Error('Failed to generate PromptPay payload');
    }
  }

  /**
   * Generate QR code image as base64 data URL
   * @param amount - Payment amount in THB
   * @param referenceId - Unique reference ID for the payment
   * @returns Base64 encoded QR code image (data URL)
   */
  async generateQRCode(amount: number, referenceId: string): Promise<string> {
    try {
      // Generate the PromptPay payload
      const payload = this.generatePayload(amount, referenceId);

      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 300,
        margin: 1,
      });

      logger.info(
        { merchantId: this.merchantId, amount, referenceId },
        'Generated PromptPay QR code'
      );

      return qrCodeDataUrl;
    } catch (error) {
      logger.error(
        { error, merchantId: this.merchantId, amount, referenceId },
        'Failed to generate PromptPay QR code'
      );
      throw new Error('Failed to generate PromptPay QR code');
    }
  }
}

// Export singleton instance (will be initialized with config)
let promptPayClient: PromptPayClient | null = null;

export function initializePromptPayClient(config: PromptPayConfig): void {
  promptPayClient = new PromptPayClient(config);
}

export function getPromptPayClient(): PromptPayClient {
  if (!promptPayClient) {
    throw new Error('PromptPay client not initialized. Call initializePromptPayClient first.');
  }
  return promptPayClient;
}
