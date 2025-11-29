import { paymentsRepository } from './payments.repository';
import { ordersRepository } from '../orders/orders.repository';
import { db } from '../../core/database';
import { orders } from '../../core/database/schema/orders.schema';
import { eq } from 'drizzle-orm';
import { ValidationError, NotFoundError } from '../../core/errors';
import { emailService } from '../../core/email';
import { logger } from '../../core/logger';
import { config } from '../../core/config';
import { getPromptPayClient } from '../../libs/promptpay-client';
import { getTwoC2PClient } from '../../libs/2c2p-client';
import crypto from 'crypto';
import type {
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
   * Process PromptPay payment
   * Creates payment record and generates QR code
   */
  async processPromptPayPayment(
    orderId: string,
    amount: number
  ): Promise<{ paymentId: string; qrCode: string; expiresAt: Date }> {
    // Validate input
    this.validatePaymentData(orderId, amount);

    // Verify order exists and is unpaid
    const order = await ordersRepository.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError('Order');
    }

    if (order.paymentStatus === 'paid') {
      throw new ValidationError('Order is already paid');
    }

    // Verify amount matches order total
    if (amount !== order.totalAmount) {
      throw new ValidationError('Payment amount does not match order total');
    }

    // Create payment record
    const payment = await paymentsRepository.createPayment({
      orderId,
      paymentMethod: 'promptpay',
      paymentProvider: 'promptpay',
      amount,
      currency: 'THB',
    });

    // Generate QR code
    const promptPayClient = getPromptPayClient();
    // Convert amount from cents to THB for QR code generation
    const amountInTHB = amount / 100;
    const qrCode = await promptPayClient.generateQRCode(
      amountInTHB,
      payment.id
    );

    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + config.payment.qrExpiryMinutes
    );

    logger.info(
      { paymentId: payment.id, orderId, amount, expiresAt },
      'PromptPay payment created'
    );

    return {
      paymentId: payment.id,
      qrCode,
      expiresAt,
    };
  }

  /**
   * Initiate 2C2P payment
   * Creates payment record and returns payment URL for redirect
   */
  async initiate2C2PPayment(
    orderId: string,
    amount: number,
    returnUrl: string
  ): Promise<{ paymentId: string; paymentUrl: string }> {
    // Validate input
    this.validatePaymentData(orderId, amount);

    if (!returnUrl || returnUrl.trim() === '') {
      throw new ValidationError('Return URL is required');
    }

    // Verify order exists and is unpaid
    const order = await ordersRepository.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError('Order');
    }

    if (order.paymentStatus === 'paid') {
      throw new ValidationError('Order is already paid');
    }

    // Verify amount matches order total
    if (amount !== order.totalAmount) {
      throw new ValidationError('Payment amount does not match order total');
    }

    // Create payment record
    const payment = await paymentsRepository.createPayment({
      orderId,
      paymentMethod: 'credit_card',
      paymentProvider: '2c2p',
      amount,
      currency: 'THB',
    });

    // Initialize 2C2P client
    const twoC2PClient = getTwoC2PClient({
      merchantId: config.payment.twoC2P.merchantId,
      secretKey: config.payment.twoC2P.secretKey,
      apiUrl: config.payment.twoC2P.apiUrl,
    });

    // Create payment session with 2C2P
    const session = await twoC2PClient.createPaymentSession({
      orderId: payment.id,
      amount,
      currency: 'THB',
      returnUrl,
    });

    // Store session ID in provider response
    await paymentsRepository.updatePaymentStatus(
      payment.id,
      'pending',
      undefined,
      { sessionId: session.sessionId }
    );

    logger.info(
      { paymentId: payment.id, orderId, amount, sessionId: session.sessionId },
      '2C2P payment initiated'
    );

    return {
      paymentId: payment.id,
      paymentUrl: session.paymentUrl,
    };
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
          if (order && emailService.isEnabled()) {
            await emailService.sendPaymentConfirmationEmail(
              order.email,
              order.orderNumber,
              payment.amount,
              payment.currency,
              payment.paymentMethod,
              payment.transactionId
            );
          }
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
          if (order && emailService.isEnabled()) {
            await emailService.sendPaymentFailedEmail(
              order.email,
              order.orderNumber,
              payment.amount,
              payment.currency,
              payment.paymentMethod,
              reason
            );
          }
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
    payload: TwoC2PWebhookPayload
  ): Promise<void> {
    // Initialize 2C2P client for signature verification
    const twoC2PClient = getTwoC2PClient({
      merchantId: config.payment.twoC2P.merchantId,
      secretKey: config.payment.twoC2P.secretKey,
      apiUrl: config.payment.twoC2P.apiUrl,
    });

    // Verify webhook signature using 2C2P client
    if (!twoC2PClient.verifyWebhookSignature(payload, payload.hash_value)) {
      logger.error(
        { orderId: payload.order_id },
        'Invalid 2C2P webhook signature'
      );
      throw new ValidationError('Invalid webhook signature');
    }

    // Check idempotency - prevent duplicate processing
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

    // Find payment by payment ID (order_id in webhook is actually payment ID)
    let payment = existingPayment;
    
    if (!payment) {
      payment = await paymentsRepository.getPaymentById(payload.order_id);
    }

    if (!payment) {
      logger.error(
        { orderId: payload.order_id },
        'Payment not found for 2C2P webhook'
      );
      throw new NotFoundError('Payment');
    }

    // Extract card details if available
    const cardLast4 = payload.card_number
      ? payload.card_number.slice(-4)
      : null;
    const cardBrand = payload.card_brand || null;

    // Build provider response with card details
    const providerResponse = {
      version: payload.version,
      merchant_id: payload.merchant_id,
      payment_status: payload.payment_status,
      amount: payload.amount,
      currency: payload.currency,
      transaction_ref: payload.transaction_ref,
      cardLast4,
      cardBrand,
      processedAt: new Date().toISOString(),
    };

    // Update payment with transaction reference and provider response
    await paymentsRepository.updatePaymentStatus(
      payment.id,
      payment.status,
      payload.transaction_ref,
      providerResponse
    );

    // Update card details in payment record if available
    if (cardLast4 || cardBrand) {
      const { payments: paymentsTable } = await import('../../core/database/schema/orders.schema');
      await db
        .update(paymentsTable)
        .set({
          cardLast4,
          cardBrand,
        })
        .where(eq(paymentsTable.id, payment.id));
    }

    // Process based on payment status
    // 2C2P uses '000' for success, or 'success' string
    if (
      payload.payment_status === '000' ||
      payload.payment_status === 'success' ||
      payload.payment_status === 'completed'
    ) {
      await this.completePayment(payment.id);
      logger.info(
        { paymentId: payment.id, transactionId: payload.transaction_ref },
        '2C2P payment completed via webhook'
      );
    } else {
      await this.failPayment(
        payment.id,
        `Payment failed with status: ${payload.payment_status}`
      );
      logger.warn(
        { 
          paymentId: payment.id, 
          transactionId: payload.transaction_ref,
          status: payload.payment_status 
        },
        '2C2P payment failed via webhook'
      );
    }
  }

  /**
   * Handle 2C2P return URL
   * Parse return parameters and verify payment status
   */
  async handle2C2PReturn(params: {
    order_id: string;
    payment_status: string;
    transaction_ref?: string;
  }): Promise<PaymentStatusResponse> {
    // Find payment by payment ID (order_id in return params is actually payment ID)
    const payment = await paymentsRepository.getPaymentById(params.order_id);
    
    if (!payment) {
      logger.error(
        { orderId: params.order_id },
        'Payment not found for 2C2P return'
      );
      throw new NotFoundError('Payment');
    }

    // Get current payment status (webhook may have already updated it)
    const currentStatus = await this.getPaymentStatus(payment.id);

    logger.info(
      { 
        paymentId: payment.id, 
        returnStatus: params.payment_status,
        currentStatus: currentStatus.status,
        transactionRef: params.transaction_ref 
      },
      '2C2P return URL processed'
    );

    // Return current payment status
    return currentStatus;
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

}

export const paymentsDomain = new PaymentsDomain();
