import { paymentsRepository } from './payments.repository';
import { ordersRepository } from '../orders/orders.repository';
import { db } from '../../core/database';
import { orders } from '../../core/database/schema/orders.schema';
import { eq } from 'drizzle-orm';
import { ValidationError, NotFoundError } from '../../core/errors';
import { emailService } from '../../core/email';
import { logger } from '../../core/logger';
import { paymentConfig, getPaymentExpiryDate } from '../../core/config/payment.config';
import { getPromptPayClient } from '../../libs/promptpay-client';
import { getTwoC2PClient } from '../../libs/2c2p-client';
import crypto from 'crypto';
import type {
  PaymentStatus,
  PaymentStatusResponse,
  PromptPayWebhookPayload,
  TwoC2PReturnPayload,
  TwoC2PWebhookPayload,
} from './payments.interface';
import jwt from 'jsonwebtoken';
import { PgTx } from '../../core/database/types';

// Lazy load orders domain to avoid circular dependency
function getOrdersDomain() {
  // Use require to avoid circular dependency issues
  const { ordersDomain } = require('../orders/orders.domain');
  return ordersDomain;
}

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

    // Calculate expiration time using payment config helper
    const expiresAt = getPaymentExpiryDate();

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
    returnUrl: string,
    userId: string
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
      merchantId: paymentConfig.twoC2P.merchantId,
      secretKey: paymentConfig.twoC2P.secretKey,
      apiUrl: paymentConfig.twoC2P.apiUrl,
      backendReturnUrl: paymentConfig.twoC2P.backendReturnUrl,
    });

    // Create payment session with 2C2P
    const session = await twoC2PClient.createPaymentSession({
      orderId: payment.id,
      amount,
      currency: 'THB',
      returnUrl,
      userId
    });

    await Promise.all([
      paymentsRepository.updatePaymentStatus(
        payment.id,
        'pending',
        undefined,
        { sessionId: session.sessionId }
      ),
      ordersRepository.updateOrderInvoiceNo(payment.orderId, session.meta.invoiceNo)
    ])

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
  async completePayment(paymentId: string, tnx?: PgTx): Promise<void> {
    // Execute transaction first
    await (tnx || db).transaction(async (tx) => {
      // Get payment details
      const payment = await paymentsRepository.getPaymentById(paymentId);
      if (!payment) {
        throw new NotFoundError('Payment');
      }

      // Validate status transition
      this.validateStatusTransition(payment.status, 'completed');

      // Update payment status
      await paymentsRepository.markPaymentCompleted(paymentId, new Date());

      // Update order payment status
      await tx
        .update(orders)
        .set({
          paymentStatus: 'paid',
          paidAt: new Date(),
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

    // After transaction completes, trigger order status update through order domain
    // This ensures state machine validation and proper email notifications
    const updatedPayment = await paymentsRepository.getPaymentById(paymentId);

    if (updatedPayment) {
      try {
        // Await the event handling to ensure it completes
        const ordersDomain = getOrdersDomain();
        await ordersDomain.handlePaymentEvent({
          type: 'payment_completed',
          orderId: updatedPayment!.orderId,
          timestamp: new Date(),
          metadata: {
            paymentId,
            transactionId: updatedPayment!.transactionId || undefined,
          },
        });
      } catch (error) {
        logger.error(
          { error, paymentId, orderId: updatedPayment!.orderId },
          'Failed to handle payment completion event'
        );
        // Don't throw - payment is already completed, this is just status sync
      }
    }
  }

  /**
   * Fail payment workflow
   * Updates payment status and order status
   */
  async failPayment(paymentId: string, reason: string, tnx?: PgTx): Promise<void> {
    // Execute transaction first
    await (tnx || db).transaction(async (tx) => {
      // Get payment details
      const payment = await paymentsRepository.getPaymentById(paymentId);
      if (!payment) {
        throw new NotFoundError('Payment');
      }

      // Validate status transition
      this.validateStatusTransition(payment.status, 'failed');

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

    // After transaction completes, trigger order status event through order domain
    // This records the failure in order status history
    const updatedPayment = await paymentsRepository.getPaymentById(paymentId);
    if (updatedPayment) {
      try {
        const ordersDomain = getOrdersDomain();
        await ordersDomain.handlePaymentEvent({
          type: 'payment_failed',
          orderId: updatedPayment!.orderId,
          timestamp: new Date(),
          metadata: {
            paymentId,
            reason,
          },
        });
      } catch (error) {
        logger.error(
          { error, paymentId, orderId: updatedPayment!.orderId },
          'Failed to handle payment failure event'
        );
      }
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId: string, tnx?: PgTx): Promise<PaymentStatusResponse> {
    const payment = await paymentsRepository.getPaymentById(paymentId, tnx);
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
   * Check if payment has expired
   * A payment is considered expired if it's still pending and has exceeded the expiration time
   */
  async checkPaymentExpiration(paymentId: string): Promise<{ expired: boolean; expiresAt: Date; now: Date }> {
    const payment = await paymentsRepository.getPaymentById(paymentId);
    if (!payment) {
      throw new NotFoundError('Payment');
    }

    // Calculate expiration time from payment creation
    const expiryMs = paymentConfig.settings.qrExpiryMinutes * 60 * 1000;
    const expiresAt = new Date(payment.createdAt.getTime() + expiryMs);
    const now = new Date();

    // Payment is expired if it's still pending and current time is past expiration
    const expired = payment.status === 'pending' && now > expiresAt;

    logger.debug(
      {
        paymentId,
        status: payment.status,
        createdAt: payment.createdAt,
        expiresAt,
        now,
        expired
      },
      'Payment expiration check'
    );

    return {
      expired,
      expiresAt,
      now,
    };
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
   * Process 2C2P return data from POST request (Backend decoding)
   * 
   * @param payloadRaw - Raw payment response string (JWT or JSON wrapped)
   */
  async process2C2PReturnData(payloadRaw: string) {
    try {
      let decodedData: any = jwt.decode(payloadRaw);

      // If JWT decode fails (returns null) or isn't a valid object, try standard Base64 decode
      if (!decodedData) {
        try {
          const buffer = Buffer.from(payloadRaw, 'base64');
          const jsonString = buffer.toString('utf-8');
          decodedData = JSON.parse(jsonString);
        } catch (e) {
          logger.warn({ error: e, payloadRaw }, 'Failed to fallback decode 2C2P payload as Base64 JSON');
          // Start of logic to handle raw string if it's not JSON? 
          // For now assume it must be JSON.
        }
      }

      const status = decodedData?.respCode === '0000' || decodedData?.respCode === '2000' ? 'completed' : 'failed';
      // 2C2P sometimes sends '2000' for success in some flows, or '0000'. The user log showed '2000'.

      const transactionRef = decodedData?.tranRef || decodedData?.transactionRef;
      const invoiceNo = decodedData?.invoiceNo;
      const paymentId = decodedData?.userDefined1;


      if (!invoiceNo) {
        throw new ValidationError('Missing invoice/order number in return data');
      }

      if (!paymentId) {
        throw new ValidationError('Missing payment ID in return data');
      }

      return db.transaction(async tx => {
        try {
          // Find the order by orderId (orderId is stored on the order table, not the payment)
          const payment = await paymentsRepository.getPaymentById(paymentId, tx);

          if (!payment) {
            logger.warn({ paymentId }, 'Payment not found by paymentId during 2C2P return processing');
            throw new NotFoundError('Payment');
          }

          if (payment) {
            // Only update if currently pending and we have a definitive result
            if (payment.status === 'pending') {
              if (status === 'completed') {
                await Promise.all([
                  ordersRepository.updatePaymentStatus(payment.orderId, 'paid', tx),
                  this.completePayment(payment.id, tx)
                ])
              } else if (status === 'failed') {
                await Promise.all([
                  ordersRepository.updatePaymentStatus(payment.orderId, 'failed', tx),
                  this.failPayment(payment.id, decodedData?.respDesc || 'Payment failed (return)', tx)
                ])
              }
            }
          } else {
            logger.warn({ invoiceNo, paymentId }, 'Payment not found for order during 2C2P return processing');
          }

          console.log('set status completed');


          // Return the payment status response
          // We fetch fresh status to be sure
          if (payment) {
            const currentStatus = await this.getPaymentStatus(payment.id, tx);
            console.log({ currentStatus });

            return {
              ...currentStatus,
              message: decodedData?.respDesc || (status === 'completed' ? 'Success' : 'Payment Failed'),
              transactionRef
            };
          }

          console.log('set status failed');

          // If no payment found, return basic status info
          return {
            paymentId: paymentId,
            status,
            transactionId: transactionRef,
            message: decodedData?.respDesc || (status === 'completed' ? 'Success' : 'Payment Failed'),
            transactionRef
          };
        } catch (error) {
          console.log({ error });

          // TODO: Save to retry table and using cronjob to retry action.

          tx.rollback();
          logger.error(
            {
              error,
              payloadRaw,
            },
            'Failed to handle 2C2P return event'
          );
          throw error; // Re-throw to allow proper error handling by caller
        }
      })
    } catch (error) {
      logger.error(
        {
          error,
          payloadRaw,
        },
        'Failed to handle 2C2P return event'
      );
      throw error; // Re-throw to allow proper error handling by caller
    }
  }

  /**
   * Process refund workflow
   * Updates payment status to refunded and triggers order status update
   */
  async processRefund(
    paymentId: string,
    reason: string,
    adminId?: string
  ): Promise<void> {
    // Execute transaction first
    await db.transaction(async (tx) => {
      // Get payment details
      const payment = await paymentsRepository.getPaymentById(paymentId);
      if (!payment) {
        throw new NotFoundError('Payment');
      }

      // Validate status transition
      this.validateStatusTransition(payment.status, 'refunded');

      // Update payment status to refunded
      await paymentsRepository.updatePaymentStatus(
        paymentId,
        'refunded',
        payment.transactionId || undefined,
        {
          refundedAt: new Date().toISOString(),
          refundReason: reason,
          refundedBy: adminId,
        }
      );

      // Update order payment status
      await tx
        .update(orders)
        .set({
          paymentStatus: 'refunded',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, payment.orderId));

      logger.info(
        { paymentId, orderId: payment.orderId, reason, adminId },
        'Payment refunded'
      );
    });

    // After transaction completes, trigger order status update through order domain
    const updatedPayment = await paymentsRepository.getPaymentById(paymentId);
    if (updatedPayment) {
      try {
        const ordersDomain = getOrdersDomain();
        await ordersDomain.handlePaymentEvent({
          type: 'refund_processed',
          orderId: updatedPayment!.orderId,
          timestamp: new Date(),
          metadata: {
            paymentId,
            reason,
            adminId,
          },
        });
      } catch (error) {
        logger.error(
          { error, paymentId, orderId: updatedPayment!.orderId },
          'Failed to handle refund event'
        );
      }
    }
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

    // Validate status transition
    this.validateStatusTransition(payment.status, 'completed');

    // Update payment and order in transaction
    await db.transaction(async (tx) => {
      // Update payment with manual verification flag and mark as completed
      await paymentsRepository.markPaymentCompleted(paymentId, new Date());

      // Store manual verification metadata
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

      // Update order payment status
      await tx
        .update(orders)
        .set({
          paymentStatus: 'paid',
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, payment.orderId));
    });

    // Send confirmation email (outside transaction)
    setImmediate(async () => {
      try {
        const order = await paymentsRepository.getPaymentById(paymentId);
        if (order && emailService.isEnabled()) {
          const orderDetails = await db
            .select()
            .from(orders)
            .where(eq(orders.id, payment.orderId))
            .limit(1);

          if (orderDetails[0]) {
            await emailService.sendPaymentConfirmationEmail(
              orderDetails[0].email,
              orderDetails[0].orderNumber,
              payment.amount,
              payment.currency,
              payment.paymentMethod,
              payment.transactionId
            );
          }
        }
      } catch (error) {
        logger.error(
          { error, paymentId, orderId: payment.orderId },
          'Failed to send payment confirmation email after manual verification'
        );
      }
    });

    logger.info(
      { paymentId, adminId, note },
      'Payment manually verified by admin'
    );

    // After transaction completes, trigger order status update through order domain
    try {
      const ordersDomain = getOrdersDomain();
      await ordersDomain.handlePaymentEvent({
        type: 'payment_completed',
        orderId: payment!.orderId,
        timestamp: new Date(),
        metadata: {
          paymentId,
          manualVerification: true,
          verifiedBy: adminId,
          note,
        },
      });
    } catch (error) {
      logger.error(
        { error, paymentId, orderId: payment!.orderId },
        'Failed to handle manual verification event'
      );
    }
  }

}

export const paymentsDomain = new PaymentsDomain();
