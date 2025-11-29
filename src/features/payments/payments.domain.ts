import { paymentsRepository } from './payments.repository';
import { ordersRepository } from '../orders/orders.repository';
import { db } from '../../core/database';
import { orders } from '../../core/database/schema/orders.schema';
import { eq } from 'drizzle-orm';
import { ValidationError, NotFoundError, AppError } from '../../core/errors';
import { emailService } from '../../core/email';
import { logger } from '../../core/logger';
import crypto from 'crypto';
import type {
  CreatePaymentData,
  PaymentStatus,
  PaymentStatusResponse,
  PromptPayWebhookPayload,
  TwoC2PWebhookPayload,
} from './payments.interface';

export class PaymentsDomain {
  /**
   * Validate payment data
   */
  private validatePaymentData(orderId: string, amount: number): void {
    if (!orderId || orderId.trim() === '') {
      throw new ValidationError('Order ID is required');
    }

    if (amount <= 0) {
      throw new ValidationError('Payment amount must be greater than zero');
    }
  }

  /**
   * Verify webhook signature using HMAC-SHA256
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    try {
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const expectedSignature = hmac.digest('hex');

      // Use timing-safe comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error({ error }, 'Error verifying webhook signature');
      return false;
    }
  }

  /**
   * Validate payment status transition
   */
  private validateStatusTransition(
    currentStatus: PaymentStatus,
    newStatus: PaymentStatus
  ): void {
    // Define valid status transitions
    const validTransitions: Record<PaymentStatus, PaymentStatus[]> = {
      pending: ['completed', 'failed'],
      completed: ['refunded'],
      failed: ['pending'], // Allow retry
      refunded: [], // Terminal state
    };

    const allowedStatuses = validTransitions[currentStatus] || [];

    if (!allowedStatuses.includes(newStatus)) {
      throw new ValidationError(
        `Invalid status transition from ${currentStatus} to ${newStatus}`
      );
    }
  }

  /**
   * Complete payment workflow
   * Updates payment status, order status, and sends confirmation email
   */
  async completePayment(paymentId: string): Promise<void> {
    return await db.transaction(async (tx) => {
      // Get payment details
      const payment = await paymentsRepository.getPaymentById(paymentId);
      if (!payment) {
        throw new NotFoundError('Payment');
      }

      // Validate status transition
      this.validateStatusTransition(payment.status, 'completed');

      // Update payment status
      await paymentsRepository.markPaymentCompleted(paymentId, new Date());

      // Update order status
      await tx
        .update(orders)
        .set({
          paymentStatus: 'paid',
          paidAt: new Date(),
          status: 'processing',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, payment.orderId));

      // Get order details for email
      const order = await ordersRepository.getOrderById(payment.orderId);

      // Send confirmation email (outside transaction to avoid blocking)
      setImmediate(async () => {
        try {
          await this.sendPaymentConfirmationEmail(payment, order);
        } catch (error) {
          logger.error(
            { error, paymentId, orderId: payment.orderId },
            'Failed to send payment confirmation email'
          );
        }
      });

      logger.info(
        { paymentId, orderId: payment.orderId },
        'Payment completed successfully'
      );
    });
  }

  /**
   * Fail payment workflow
   * Updates payment status and order status
   */
  async failPayment(paymentId: string, reason: string): Promise<void> {
    return await db.transaction(async (tx) => {
      // Get payment details
      const payment = await paymentsRepository.getPaymentById(paymentId);
      if (!payment) {
        throw new NotFoundError('Payment');
      }

      // Update payment status
      await paymentsRepository.markPaymentFailed(paymentId, new Date(), reason);

      // Update order payment status
      await tx
        .update(orders)
        .set({
          paymentStatus: 'failed',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, payment.orderId));

      // Get order details for email
      const order = await ordersRepository.getOrderById(payment.orderId);

      // Send failure notification email
      setImmediate(async () => {
        try {
          await this.sendPaymentFailedEmail(payment, order, reason);
        } catch (error) {
          logger.error(
            { error, paymentId, orderId: payment.orderId },
            'Failed to send payment failure email'
          );
        }
      });

      logger.warn(
        { paymentId, orderId: payment.orderId, reason },
        'Payment failed'
      );
    });
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
    const payment = await paymentsRepository.getPaymentById(paymentId);
    if (!payment) {
      throw new NotFoundError('Payment');
    }

    return {
      paymentId: payment.id,
      status: payment.status,
      transactionId: payment.transactionId,
      amount: payment.amount,
      createdAt: payment.createdAt,
      completedAt: payment.completedAt,
    };
  }

  /**
   * Handle PromptPay webhook
   */
  async handlePromptPayWebhook(
    payload: PromptPayWebhookPayload,
    signature: string,
    webhookSecret: string
  ): Promise<void> {
    // Verify webhook signature
    const payloadString = JSON.stringify(payload);
    if (!this.verifyWebhookSignature(payloadString, signature, webhookSecret)) {
      throw new ValidationError('Invalid webhook signature');
    }

    // Check idempotency - prevent duplicate processing
    const existingPayment = await paymentsRepository.getPaymentByTransactionId(
      payload.transactionId
    );

    if (existingPayment && existingPayment.status !== 'pending') {
      logger.info(
        { transactionId: payload.transactionId },
        'Webhook already processed (idempotency check)'
      );
      return;
    }

    // Find payment by reference ID (order ID or payment ID)
    const payment = existingPayment || await paymentsRepository.getPaymentById(payload.referenceId);
    
    if (!payment) {
      throw new NotFoundError('Payment');
    }

    // Update payment with transaction ID
    await paymentsRepository.updatePaymentStatus(
      payment.id,
      payment.status,
      payload.transactionId,
      payload
    );

    // Process based on payment status
    if (payload.status === 'success' || payload.status === 'completed') {
      await this.completePayment(payment.id);
    } else if (payload.status === 'failed') {
      await this.failPayment(payment.id, 'Payment failed via PromptPay');
    }

    logger.info(
      { paymentId: payment.id, transactionId: payload.transactionId },
      'PromptPay webhook processed'
    );
  }

  /**
   * Handle 2C2P webhook
   */
  async handle2C2PWebhook(
    payload: TwoC2PWebhookPayload,
    webhookSecret: string
  ): Promise<void> {
    // Verify webhook signature (hash_value)
    const dataToHash = `${payload.merchant_id}${payload.order_id}${payload.payment_status}${payload.amount}${payload.currency}`;
    const expectedHash = crypto
      .createHmac('sha256', webhookSecret)
      .update(dataToHash)
      .digest('hex');

    if (payload.hash_value !== expectedHash) {
      throw new ValidationError('Invalid webhook signature');
    }

    // Check idempotency
    const existingPayment = await paymentsRepository.getPaymentByTransactionId(
      payload.transaction_ref
    );

    if (existingPayment && existingPayment.status !== 'pending') {
      logger.info(
        { transactionId: payload.transaction_ref },
        'Webhook already processed (idempotency check)'
      );
      return;
    }

    // Find payment by order ID
    const payments = await paymentsRepository.getPaymentsByOrderId(
      payload.order_id
    );
    const payment = payments.find((p) => p.status === 'pending') || payments[0];

    if (!payment) {
      throw new NotFoundError('Payment');
    }

    // Extract card details if available
    const cardLast4 = payload.card_number
      ? payload.card_number.slice(-4)
      : null;
    const cardBrand = payload.card_brand || null;

    // Update payment with transaction details
    const providerResponse = {
      ...payload,
      cardLast4,
      cardBrand,
    };

    await paymentsRepository.updatePaymentStatus(
      payment.id,
      payment.status,
      payload.transaction_ref,
      providerResponse
    );

    // Process based on payment status
    if (
      payload.payment_status === '000' ||
      payload.payment_status === 'success'
    ) {
      await this.completePayment(payment.id);
    } else {
      await this.failPayment(
        payment.id,
        `Payment failed with status: ${payload.payment_status}`
      );
    }

    logger.info(
      { paymentId: payment.id, transactionId: payload.transaction_ref },
      '2C2P webhook processed'
    );
  }

  /**
   * Manually verify payment (admin action)
   */
  async manuallyVerifyPayment(
    paymentId: string,
    adminId: string,
    note?: string
  ): Promise<void> {
    const payment = await paymentsRepository.getPaymentById(paymentId);
    if (!payment) {
      throw new NotFoundError('Payment');
    }

    if (payment.status === 'completed') {
      throw new ValidationError('Payment is already completed');
    }

    // Update payment with manual verification flag
    await paymentsRepository.updatePaymentStatus(
      paymentId,
      'completed',
      undefined,
      {
        manualVerification: true,
        verifiedBy: adminId,
        verificationNote: note,
        verifiedAt: new Date().toISOString(),
      }
    );

    // Complete payment workflow
    await this.completePayment(paymentId);

    logger.info(
      { paymentId, adminId, note },
      'Payment manually verified by admin'
    );
  }

  /**
   * Send payment confirmation email
   */
  private async sendPaymentConfirmationEmail(
    payment: any,
    order: any
  ): Promise<void> {
    if (!emailService.isEnabled()) {
      logger.warn('Email service not configured, skipping confirmation email');
      return;
    }

    const subject = `Payment Confirmation - Order ${order.orderNumber}`;
    const html = this.getPaymentConfirmationEmailTemplate(payment, order);

    await emailService.sendEmail(order.email, subject, html);
  }

  /**
   * Send payment failed email
   */
  private async sendPaymentFailedEmail(
    payment: any,
    order: any,
    reason: string
  ): Promise<void> {
    if (!emailService.isEnabled()) {
      logger.warn('Email service not configured, skipping failure email');
      return;
    }

    const subject = `Payment Failed - Order ${order.orderNumber}`;
    const html = this.getPaymentFailedEmailTemplate(payment, order, reason);

    await emailService.sendEmail(order.email, subject, html);
  }

  /**
   * Payment confirmation email template
   */
  private getPaymentConfirmationEmailTemplate(
    payment: any,
    order: any
  ): string {
    const amount = (payment.amount / 100).toFixed(2);
    const paymentMethod = payment.paymentMethod.replace('_', ' ').toUpperCase();

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Confirmation</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="padding: 40px 40px 20px 40px; text-align: center;">
                      <h1 style="margin: 0; color: #28a745; font-size: 24px; font-weight: bold;">✓ Payment Confirmed</h1>
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="padding: 20px 40px;">
                      <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                        Your payment has been successfully processed!
                      </p>
                      
                      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee;">
                            <strong style="color: #333333;">Order Number:</strong>
                          </td>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee; text-align: right; color: #666666;">
                            ${order.orderNumber}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee;">
                            <strong style="color: #333333;">Payment Amount:</strong>
                          </td>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee; text-align: right; color: #666666;">
                            ${amount} ${payment.currency}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee;">
                            <strong style="color: #333333;">Payment Method:</strong>
                          </td>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee; text-align: right; color: #666666;">
                            ${paymentMethod}
                          </td>
                        </tr>
                        ${
                          payment.transactionId
                            ? `
                        <tr>
                          <td style="padding: 10px 0;">
                            <strong style="color: #333333;">Transaction ID:</strong>
                          </td>
                          <td style="padding: 10px 0; text-align: right; color: #666666;">
                            ${payment.transactionId}
                          </td>
                        </tr>
                        `
                            : ''
                        }
                      </table>
                      
                      <p style="margin: 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                        Your order is now being processed and will be shipped soon.
                      </p>
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="padding: 30px 40px; border-top: 1px solid #eeeeee;">
                      <p style="margin: 0; color: #999999; font-size: 12px; line-height: 1.5;">
                        Thank you for your purchase!
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  /**
   * Payment failed email template
   */
  private getPaymentFailedEmailTemplate(
    payment: any,
    order: any,
    reason: string
  ): string {
    const amount = (payment.amount / 100).toFixed(2);
    const paymentMethod = payment.paymentMethod.replace('_', ' ').toUpperCase();

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Failed</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <tr>
                    <td style="padding: 40px 40px 20px 40px; text-align: center;">
                      <h1 style="margin: 0; color: #dc3545; font-size: 24px; font-weight: bold;">✗ Payment Failed</h1>
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="padding: 20px 40px;">
                      <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                        Unfortunately, your payment could not be processed.
                      </p>
                      
                      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee;">
                            <strong style="color: #333333;">Order Number:</strong>
                          </td>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee; text-align: right; color: #666666;">
                            ${order.orderNumber}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee;">
                            <strong style="color: #333333;">Payment Amount:</strong>
                          </td>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee; text-align: right; color: #666666;">
                            ${amount} ${payment.currency}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee;">
                            <strong style="color: #333333;">Payment Method:</strong>
                          </td>
                          <td style="padding: 10px 0; border-bottom: 1px solid #eeeeee; text-align: right; color: #666666;">
                            ${paymentMethod}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 10px 0;">
                            <strong style="color: #333333;">Reason:</strong>
                          </td>
                          <td style="padding: 10px 0; text-align: right; color: #dc3545;">
                            ${reason}
                          </td>
                        </tr>
                      </table>
                      
                      <p style="margin: 20px 0; color: #666666; font-size: 16px; line-height: 1.5;">
                        Please try again or use a different payment method. If the problem persists, contact our support team.
                      </p>
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="padding: 30px 40px; border-top: 1px solid #eeeeee;">
                      <p style="margin: 0; color: #999999; font-size: 12px; line-height: 1.5;">
                        Need help? Contact our support team.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }
}

export const paymentsDomain = new PaymentsDomain();
