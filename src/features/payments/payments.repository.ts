import { db } from '../../core/database';
import { payments } from '../../core/database/schema/orders.schema';
import { eq, and, sql } from 'drizzle-orm';
import { NotFoundError } from '../../core/errors';
import type {
  CreatePaymentData,
  Payment,
  PaymentStatus,
} from './payments.interface';
import { PgTx } from '../../core/database/types';

export class PaymentsRepository {
  /**
   * Create a new payment transaction
   */
  async createPayment(data: CreatePaymentData): Promise<Payment> {
    const [payment] = await db
      .insert(payments)
      .values({
        orderId: data.orderId,
        paymentMethod: data.paymentMethod,
        paymentProvider: data.paymentProvider || null,
        amount: data.amount,
        currency: data.currency,
        status: 'pending',
      })
      .returning();

    return payment as Payment;
  }

  /**
   * Get payment by ID
   */
  async getPaymentById(id: string, tx?: PgTx): Promise<Payment | null> {
    const [payment] = await (tx || db)
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .limit(1);

    return payment ? (payment as Payment) : null;
  }

  /**
   * Get all payments for an order
   */
  async getPaymentsByOrderId(orderId: string, tx?: PgTx): Promise<Payment[]> {
    const result = await (tx || db)
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId));

    return result as Payment[];
  }

  /**
   * Update payment status with transaction support
   */
  async updatePaymentStatus(
    id: string,
    status: PaymentStatus,
    transactionId?: string,
    providerResponse?: any
  ): Promise<Payment> {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (transactionId) {
      updateData.transactionId = transactionId;
    }

    if (providerResponse) {
      updateData.providerResponse = providerResponse;
    }

    if (status === 'completed') {
      updateData.completedAt = new Date();
    } else if (status === 'failed') {
      updateData.failedAt = new Date();
    }

    const [payment] = await db
      .update(payments)
      .set(updateData)
      .where(eq(payments.id, id))
      .returning();

    if (!payment) {
      throw new NotFoundError('Payment');
    }

    return payment as Payment;
  }

  /**
   * Get payment by transaction ID (for idempotency)
   */
  async getPaymentByTransactionId(
    transactionId: string
  ): Promise<Payment | null> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.transactionId, transactionId))
      .limit(1);

    return payment ? (payment as Payment) : null;
  }

  /**
   * Mark payment as completed
   */
  async markPaymentCompleted(id: string, completedAt: Date): Promise<Payment> {
    const [payment] = await db
      .update(payments)
      .set({
        status: 'completed',
        completedAt
      })
      .where(eq(payments.id, id))
      .returning();

    if (!payment) {
      throw new NotFoundError('Payment');
    }

    return payment as Payment;
  }

  /**
   * Mark payment as failed
   */
  async markPaymentFailed(
    id: string,
    failedAt: Date,
    reason?: string
  ): Promise<Payment> {
    const updateData: any = {
      status: 'failed',
      failedAt,
      updatedAt: new Date(),
    };

    if (reason) {
      updateData.providerResponse = {
        ...updateData.providerResponse,
        failureReason: reason,
      };
    }

    const [payment] = await db
      .update(payments)
      .set(updateData)
      .where(eq(payments.id, id))
      .returning();

    if (!payment) {
      throw new NotFoundError('Payment');
    }

    return payment as Payment;
  }
}

export const paymentsRepository = new PaymentsRepository();
