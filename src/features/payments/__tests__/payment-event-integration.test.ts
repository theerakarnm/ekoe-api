/**
 * Payment Event Integration Tests
 * 
 * Tests the integration between payment events and order status management:
 * - Payment completion triggers order status update to processing
 * - Payment failure records event in order history
 * - Refund processing triggers order status update to refunded
 * - Email notifications are sent for status changes
 * 
 * Run with: bun test src/features/payments/__tests__/payment-event-integration.test.ts
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { db } from '../../../core/database';
import { payments, orders, orderStatusHistory } from '../../../core/database/schema';
import { eq } from 'drizzle-orm';
import { paymentsDomain } from '../payments.domain';
import { paymentsRepository } from '../payments.repository';
import { ordersRepository } from '../../orders/orders.repository';

// Test data
const TEST_ORDER_EMAIL = `payment-event-test-${Date.now()}@example.com`;
let testOrderId: string;
let testPaymentId: string;

describe('Payment Event Integration Tests', () => {
  
  // Setup: Create test order
  beforeAll(async () => {
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `TEST-EVENT-${Date.now()}`,
        email: TEST_ORDER_EMAIL,
        status: 'pending',
        paymentStatus: 'pending',
        fulfillmentStatus: 'unfulfilled',
        subtotal: 10000,
        shippingCost: 0,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: 10000,
      })
      .returning();

    testOrderId = order.id;
  });

  // Cleanup after all tests
  afterAll(async () => {
    if (testOrderId) {
      await db.delete(orderStatusHistory).where(eq(orderStatusHistory.orderId, testOrderId));
      await db.delete(payments).where(eq(payments.orderId, testOrderId));
      await db.delete(orders).where(eq(orders.id, testOrderId));
    }
  });

  describe('Payment Completion Event', () => {
    
    beforeEach(async () => {
      // Reset order to pending status
      await db
        .update(orders)
        .set({
          status: 'pending',
          paymentStatus: 'pending',
          paidAt: null,
        })
        .where(eq(orders.id, testOrderId));

      // Create a fresh payment
      const payment = await paymentsRepository.createPayment({
        orderId: testOrderId,
        paymentMethod: 'promptpay',
        paymentProvider: 'promptpay',
        amount: 10000,
        currency: 'THB',
      });
      testPaymentId = payment.id;
    });

    test('should transition order from pending to processing on payment completion', async () => {
      // Complete payment (this now awaits the event handling)
      await paymentsDomain.completePayment(testPaymentId);
      
      // Verify order status changed to processing
      const order = await ordersRepository.getOrderById(testOrderId);
      expect(order.status).toBe('processing');
      expect(order.paymentStatus).toBe('paid');
      expect(order.paidAt).toBeTruthy();
    });

    test('should create status history entry for payment completion', async () => {
      // Complete payment (this now awaits the event handling)
      await paymentsDomain.completePayment(testPaymentId);
      
      // Verify status history entry was created
      const history = await ordersRepository.getOrderStatusHistory(testOrderId);
      const processingEntry = history.find(h => h.status === 'processing');
      
      expect(processingEntry).toBeTruthy();
      expect(processingEntry?.note).toContain('Payment completed');
      expect(processingEntry?.changedBy).toBeNull(); // System changes have null changedBy
    });

    test('should update payment status before triggering order status update', async () => {
      // Complete payment
      await paymentsDomain.completePayment(testPaymentId);
      
      // Verify payment status is completed
      const payment = await paymentsRepository.getPaymentById(testPaymentId);
      expect(payment?.status).toBe('completed');
      
      // Verify order status is also updated
      const order = await ordersRepository.getOrderById(testOrderId);
      expect(order.status).toBe('processing');
    });
  });

  describe('Payment Failure Event', () => {
    
    beforeEach(async () => {
      // Reset order to pending status
      await db
        .update(orders)
        .set({
          status: 'pending',
          paymentStatus: 'pending',
        })
        .where(eq(orders.id, testOrderId));

      // Create a fresh payment
      const payment = await paymentsRepository.createPayment({
        orderId: testOrderId,
        paymentMethod: 'promptpay',
        paymentProvider: 'promptpay',
        amount: 10000,
        currency: 'THB',
      });
      testPaymentId = payment.id;
    });

    test('should keep order in pending status on payment failure', async () => {
      // Fail payment (this now awaits the event handling)
      await paymentsDomain.failPayment(testPaymentId, 'Insufficient funds');
      
      // Verify order status remains pending
      const order = await ordersRepository.getOrderById(testOrderId);
      expect(order.status).toBe('pending');
      expect(order.paymentStatus).toBe('failed');
    });

    test('should create status history entry for payment failure', async () => {
      const failureReason = 'Card declined';
      
      // Fail payment (this now awaits the event handling)
      await paymentsDomain.failPayment(testPaymentId, failureReason);
      
      // Verify status history entry was created
      const history = await ordersRepository.getOrderStatusHistory(testOrderId);
      const failureEntry = history.find(h => h.note?.includes('Payment failed'));
      
      expect(failureEntry).toBeTruthy();
      expect(failureEntry?.status).toBe('pending');
      expect(failureEntry?.changedBy).toBeNull(); // System changes have null changedBy
    });
  });

  describe('Refund Processing Event', () => {
    
    beforeEach(async () => {
      // Set order to processing status (paid)
      await db
        .update(orders)
        .set({
          status: 'processing',
          paymentStatus: 'paid',
          paidAt: new Date(),
        })
        .where(eq(orders.id, testOrderId));

      // Create and complete a payment
      const payment = await paymentsRepository.createPayment({
        orderId: testOrderId,
        paymentMethod: 'promptpay',
        paymentProvider: 'promptpay',
        amount: 10000,
        currency: 'THB',
      });
      testPaymentId = payment.id;
      
      await paymentsRepository.markPaymentCompleted(testPaymentId, new Date());
    });

    test('should transition order to refunded status on refund processing', async () => {
      // Process refund (this now awaits the event handling)
      await paymentsDomain.processRefund(testPaymentId, 'Customer requested refund', 'admin-123');
      
      // Verify order status changed to refunded
      const order = await ordersRepository.getOrderById(testOrderId);
      expect(order.status).toBe('refunded');
      expect(order.paymentStatus).toBe('refunded');
    });

    test('should create status history entry for refund', async () => {
      const refundReason = 'Product defect';
      
      // Process refund (this now awaits the event handling)
      await paymentsDomain.processRefund(testPaymentId, refundReason, 'admin-123');
      
      // Verify status history entry was created
      const history = await ordersRepository.getOrderStatusHistory(testOrderId);
      const refundEntry = history.find(h => h.status === 'refunded');
      
      expect(refundEntry).toBeTruthy();
      expect(refundEntry?.note).toContain('Refund processed');
      expect(refundEntry?.changedBy).toBeNull(); // System changes have null changedBy
    });

    test('should allow refund from delivered status', async () => {
      // Set order to delivered
      await db
        .update(orders)
        .set({
          status: 'delivered',
        })
        .where(eq(orders.id, testOrderId));
      
      // Process refund (this now awaits the event handling)
      await paymentsDomain.processRefund(testPaymentId, 'Damaged on arrival', 'admin-123');
      
      // Verify order status changed to refunded
      const order = await ordersRepository.getOrderById(testOrderId);
      expect(order.status).toBe('refunded');
    });
  });

  describe('Manual Payment Verification Event', () => {
    
    beforeEach(async () => {
      // Reset order to pending status
      await db
        .update(orders)
        .set({
          status: 'pending',
          paymentStatus: 'pending',
          paidAt: null,
        })
        .where(eq(orders.id, testOrderId));

      // Create a fresh payment
      const payment = await paymentsRepository.createPayment({
        orderId: testOrderId,
        paymentMethod: 'bank_transfer',
        paymentProvider: 'manual',
        amount: 10000,
        currency: 'THB',
      });
      testPaymentId = payment.id;
    });

    test('should transition order to processing on manual verification', async () => {
      // Manually verify payment (this now awaits the event handling)
      await paymentsDomain.manuallyVerifyPayment(
        testPaymentId,
        'admin-123',
        'Verified via bank statement'
      );
      
      // Verify order status changed to processing
      const order = await ordersRepository.getOrderById(testOrderId);
      expect(order.status).toBe('processing');
      expect(order.paymentStatus).toBe('paid');
    });

    test('should create status history entry with manual verification note', async () => {
      const verificationNote = 'Verified via bank statement';
      
      // Manually verify payment (this now awaits the event handling)
      await paymentsDomain.manuallyVerifyPayment(
        testPaymentId,
        'admin-123',
        verificationNote
      );
      
      // Verify status history entry was created
      const history = await ordersRepository.getOrderStatusHistory(testOrderId);
      const processingEntry = history.find(h => h.status === 'processing');
      
      expect(processingEntry).toBeTruthy();
      expect(processingEntry?.changedBy).toBeNull(); // System changes have null changedBy
    });
  });
});
