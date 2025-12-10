/**
 * Payment Domain Unit Tests
 * 
 * Tests payment domain logic including:
 * - Payment creation and validation
 * - Webhook signature verification
 * - Payment status transitions
 * - Payment completion workflow
 * - Error handling
 * 
 * Run with: bun test src/features/payments/__tests__/payments.domain.test.ts
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { db } from '../../../core/database';
import { payments, orders } from '../../../core/database/schema';
import { eq } from 'drizzle-orm';
import { paymentsDomain } from '../payments.domain';
import { paymentsRepository } from '../payments.repository';
import { ValidationError, NotFoundError } from '../../../core/errors';
import crypto from 'crypto';

// Helper function to get order by ID
async function getOrderById(orderId: string) {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return order || null;
}

// Test data
const TEST_ORDER_EMAIL = `contact@theerakarnm.dev`;
let testOrderId: string;
let testPaymentId: string;

describe('Payment Domain Unit Tests', () => {
  
  // Setup: Create test order directly in database
  beforeAll(async () => {
    // Create a test order directly
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `TEST-${Date.now()}`,
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
      await db.delete(payments).where(eq(payments.orderId, testOrderId));
      await db.delete(orders).where(eq(orders.id, testOrderId));
    }
  });

  describe('Payment Validation', () => {
    
    test('should validate payment amount is positive', async () => {
      try {
        await paymentsDomain.processPromptPayPayment(testOrderId, -100);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('greater than zero');
      }
    });

    test('should validate order ID is provided', async () => {
      try {
        await paymentsDomain.processPromptPayPayment('', 10000);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('Order ID is required');
      }
    });

    test('should reject payment for non-existent order', async () => {
      try {
        await paymentsDomain.processPromptPayPayment(
          '00000000-0000-0000-0000-000000000000',
          10000
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
      }
    });

    test('should reject payment amount mismatch with order total', async () => {
      try {
        await paymentsDomain.processPromptPayPayment(testOrderId, 5000); // Wrong amount
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('does not match order total');
      }
    });
  });

  describe('Webhook Signature Verification', () => {
    
    test('should verify valid webhook signature', () => {
      const secret = 'test-webhook-secret';
      const payload = JSON.stringify({ test: 'data' });
      
      // Generate valid signature
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const signature = hmac.digest('hex');

      const isValid = paymentsDomain.verifyWebhookSignature(
        payload,
        signature,
        secret
      );

      expect(isValid).toBe(true);
    });

    test('should reject invalid webhook signature', () => {
      const secret = 'test-webhook-secret';
      const payload = JSON.stringify({ test: 'data' });
      const invalidSignature = 'invalid-signature-12345';

      const isValid = paymentsDomain.verifyWebhookSignature(
        payload,
        invalidSignature,
        secret
      );

      expect(isValid).toBe(false);
    });

    test('should reject signature with wrong secret', () => {
      const secret = 'test-webhook-secret';
      const wrongSecret = 'wrong-secret';
      const payload = JSON.stringify({ test: 'data' });
      
      // Generate signature with wrong secret
      const hmac = crypto.createHmac('sha256', wrongSecret);
      hmac.update(payload);
      const signature = hmac.digest('hex');

      const isValid = paymentsDomain.verifyWebhookSignature(
        payload,
        signature,
        secret
      );

      expect(isValid).toBe(false);
    });

    test('should handle signature verification errors gracefully', () => {
      const isValid = paymentsDomain.verifyWebhookSignature(
        'payload',
        '', // Empty signature
        'secret'
      );

      expect(isValid).toBe(false);
    });
  });

  describe('Payment Status Transitions', () => {
    
    beforeEach(async () => {
      // Create a fresh payment for each test
      const payment = await paymentsRepository.createPayment({
        orderId: testOrderId,
        paymentMethod: 'promptpay',
        paymentProvider: 'promptpay',
        amount: 10000,
        currency: 'THB',
      });
      testPaymentId = payment.id;
    });

    test('should allow pending to completed transition', async () => {
      await paymentsDomain.completePayment(testPaymentId);
      
      const payment = await paymentsRepository.getPaymentById(testPaymentId);
      expect(payment?.status).toBe('completed');
      expect(payment?.completedAt).toBeTruthy();
    });

    test('should allow pending to failed transition', async () => {
      await paymentsDomain.failPayment(testPaymentId, 'Test failure');
      
      const payment = await paymentsRepository.getPaymentById(testPaymentId);
      expect(payment?.status).toBe('failed');
      expect(payment?.failedAt).toBeTruthy();
    });

    test('should reject invalid status transition', async () => {
      // First complete the payment
      await paymentsDomain.completePayment(testPaymentId);
      
      // Try to fail an already completed payment
      try {
        await paymentsDomain.failPayment(testPaymentId, 'Test failure');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('Invalid status transition');
      }
    });
  });

  describe('Payment Completion Workflow', () => {
    
    beforeEach(async () => {
      // Create a fresh payment for each test
      const payment = await paymentsRepository.createPayment({
        orderId: testOrderId,
        paymentMethod: 'promptpay',
        paymentProvider: 'promptpay',
        amount: 10000,
        currency: 'THB',
      });
      testPaymentId = payment.id;
    });

    test('should update payment status to completed', async () => {
      await paymentsDomain.completePayment(testPaymentId);
      
      const payment = await paymentsRepository.getPaymentById(testPaymentId);
      expect(payment?.status).toBe('completed');
      expect(payment?.completedAt).toBeTruthy();
    });

    test('should update order payment status to paid', async () => {
      await paymentsDomain.completePayment(testPaymentId);
      
      const order = await getOrderById(testOrderId);
      expect(order?.paymentStatus).toBe('paid');
      expect(order?.paidAt).toBeTruthy();
    });

    test('should update order status to processing', async () => {
      await paymentsDomain.completePayment(testPaymentId);
      
      const order = await getOrderById(testOrderId);
      expect(order?.status).toBe('processing');
    });

    test('should handle non-existent payment', async () => {
      try {
        await paymentsDomain.completePayment('00000000-0000-0000-0000-000000000000');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
      }
    });
  });

  describe('Payment Failure Workflow', () => {
    
    beforeEach(async () => {
      // Create a fresh payment for each test
      const payment = await paymentsRepository.createPayment({
        orderId: testOrderId,
        paymentMethod: 'promptpay',
        paymentProvider: 'promptpay',
        amount: 10000,
        currency: 'THB',
      });
      testPaymentId = payment.id;
    });

    test('should update payment status to failed', async () => {
      await paymentsDomain.failPayment(testPaymentId, 'Insufficient funds');
      
      const payment = await paymentsRepository.getPaymentById(testPaymentId);
      expect(payment?.status).toBe('failed');
      expect(payment?.failedAt).toBeTruthy();
    });

    test('should update order payment status to failed', async () => {
      await paymentsDomain.failPayment(testPaymentId, 'Insufficient funds');
      
      const order = await getOrderById(testOrderId);
      expect(order?.paymentStatus).toBe('failed');
    });

    test('should store failure reason', async () => {
      const reason = 'Card declined';
      await paymentsDomain.failPayment(testPaymentId, reason);
      
      const payment = await paymentsRepository.getPaymentById(testPaymentId);
      expect(payment?.providerResponse?.failureReason).toBe(reason);
    });
  });

  describe('Payment Status Retrieval', () => {
    
    beforeEach(async () => {
      const payment = await paymentsRepository.createPayment({
        orderId: testOrderId,
        paymentMethod: 'promptpay',
        paymentProvider: 'promptpay',
        amount: 10000,
        currency: 'THB',
      });
      testPaymentId = payment.id;
    });

    test('should retrieve payment status', async () => {
      const status = await paymentsDomain.getPaymentStatus(testPaymentId);
      
      expect(status.paymentId).toBe(testPaymentId);
      expect(status.status).toBe('pending');
      expect(status.amount).toBe(10000);
      expect(status.createdAt).toBeTruthy();
    });

    test('should handle non-existent payment', async () => {
      try {
        await paymentsDomain.getPaymentStatus('00000000-0000-0000-0000-000000000000');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
      }
    });
  });

  describe('Manual Payment Verification', () => {
    
    beforeEach(async () => {
      const payment = await paymentsRepository.createPayment({
        orderId: testOrderId,
        paymentMethod: 'promptpay',
        paymentProvider: 'promptpay',
        amount: 10000,
        currency: 'THB',
      });
      testPaymentId = payment.id;
    });

    test('should manually verify pending payment', async () => {
      const adminId = 'admin-123';
      const note = 'Verified via bank statement';
      
      await paymentsDomain.manuallyVerifyPayment(testPaymentId, adminId, note);
      
      const payment = await paymentsRepository.getPaymentById(testPaymentId);
      expect(payment?.status).toBe('completed');
      expect(payment?.providerResponse?.manualVerification).toBe(true);
      expect(payment?.providerResponse?.verifiedBy).toBe(adminId);
      expect(payment?.providerResponse?.verificationNote).toBe(note);
    });

    test('should reject manual verification of completed payment', async () => {
      // First complete the payment
      await paymentsDomain.completePayment(testPaymentId);
      
      // Try to manually verify
      try {
        await paymentsDomain.manuallyVerifyPayment(testPaymentId, 'admin-123');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('already completed');
      }
    });

    test('should handle non-existent payment', async () => {
      try {
        await paymentsDomain.manuallyVerifyPayment(
          '00000000-0000-0000-0000-000000000000',
          'admin-123'
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
      }
    });
  });
});
