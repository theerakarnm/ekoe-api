/**
 * Payment Integration Tests
 * 
 * These tests verify the complete payment flows:
 * - PromptPay payment creation and QR generation
 * - 2C2P payment initiation
 * - Payment status polling
 * - Payment retry functionality
 * - Manual payment verification
 * 
 * Prerequisites:
 * - Database running with migrations applied
 * - Test environment configured
 * - Payment provider credentials in .env (can be test credentials)
 * 
 * Run with: bun test src/__test__/payment-integration.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { db } from '../core/database';
import { payments, orders } from '../core/database/schema';
import { eq } from 'drizzle-orm';

const API_URL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
const TEST_ORDER_EMAIL = `payment-integration-${Date.now()}@example.com`;

let testOrderId: string;
let testPaymentId: string;

describe('Payment Integration Tests', () => {

  // Setup: Create test order directly in database
  beforeAll(async () => {
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

  describe('PromptPay Payment Flow', () => {

    test('should create PromptPay payment and generate QR code', async () => {
      const response = await fetch(`${API_URL}/api/payments/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: testOrderId,
          amount: 10000,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json() as any;

      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('paymentId');
      expect(data.data).toHaveProperty('qrCode');
      expect(data.data).toHaveProperty('expiresAt');

      testPaymentId = data.data.paymentId;

      // Verify QR code is a base64 string
      expect(data.data.qrCode).toMatch(/^data:image\/(png|jpeg);base64,/);
    });

    test('should create payment record in database', async () => {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, testPaymentId))
        .limit(1);

      expect(payment).toBeTruthy();
      expect(payment.orderId).toBe(testOrderId);
      expect(payment.paymentMethod).toBe('promptpay');
      expect(payment.amount).toBe(10000);
      expect(payment.status).toBe('pending');
    });

    test('should reject duplicate payment for same order', async () => {
      // Mark order as paid first
      await db
        .update(orders)
        .set({ paymentStatus: 'paid' })
        .where(eq(orders.id, testOrderId));

      const response = await fetch(`${API_URL}/api/payments/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: testOrderId,
          amount: 10000,
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);

      const data = await response.json() as any;
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('already paid');

      // Reset order status for other tests
      await db
        .update(orders)
        .set({ paymentStatus: 'pending' })
        .where(eq(orders.id, testOrderId));
    });

    test('should reject payment with invalid order ID', async () => {
      const response = await fetch(`${API_URL}/api/payments/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: '00000000-0000-0000-0000-000000000000',
          amount: 10000,
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    test('should reject payment with amount mismatch', async () => {
      const response = await fetch(`${API_URL}/api/payments/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: testOrderId,
          amount: 5000, // Wrong amount
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);

      const data = await response.json() as any;
      expect(data.error.message).toContain('does not match');
    });
  });

  describe('2C2P Payment Flow', () => {

    let test2C2POrderId: string;
    let test2C2PPaymentId: string;

    beforeAll(async () => {
      // Create separate order for 2C2P tests
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: `TEST-2C2P-${Date.now()}`,
          email: TEST_ORDER_EMAIL,
          status: 'pending',
          paymentStatus: 'pending',
          fulfillmentStatus: 'unfulfilled',
          subtotal: 15000,
          shippingCost: 0,
          taxAmount: 0,
          discountAmount: 0,
          totalAmount: 15000,
        })
        .returning();

      test2C2POrderId = order.id;
    });

    afterAll(async () => {
      if (test2C2POrderId) {
        await db.delete(payments).where(eq(payments.orderId, test2C2POrderId));
        await db.delete(orders).where(eq(orders.id, test2C2POrderId));
      }
    });

    test('should initiate 2C2P payment and return payment URL', async () => {
      const response = await fetch(`${API_URL}/api/payments/2c2p/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: test2C2POrderId,
          amount: 15000,
          returnUrl: 'http://localhost:5173/payment/2c2p/return',
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect((data as any).success).toBe(true);
      expect((data as any).data).toHaveProperty('paymentId');
      expect((data as any).data).toHaveProperty('paymentUrl');

      test2C2PPaymentId = (data as any).data.paymentId;

      // Verify payment URL is valid
      expect((data as any).data.paymentUrl).toMatch(/^https?:\/\//);
    });

    test('should create payment record with 2C2P provider', async () => {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, test2C2PPaymentId))
        .limit(1);

      expect(payment).toBeTruthy();
      expect(payment.orderId).toBe(test2C2POrderId);
      expect(payment.paymentMethod).toBe('credit_card');
      expect(payment.paymentProvider).toBe('2c2p');
      expect(payment.amount).toBe(15000);
      expect(payment.status).toBe('pending');
    });

    test('should reject 2C2P payment without return URL', async () => {
      const response = await fetch(`${API_URL}/api/payments/2c2p/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: test2C2POrderId,
          amount: 15000,
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });

  describe('Payment Status Polling', () => {

    test('should retrieve payment status', async () => {
      const response = await fetch(
        `${API_URL}/api/payments/${testPaymentId}/status`,
        {
          method: 'GET',
        }
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect((data as any).success).toBe(true);
      expect((data as any).data.paymentId).toBe(testPaymentId);
      expect((data as any).data.status).toBe('pending');
      expect((data as any).data.amount).toBe(10000);
    });

    test('should handle non-existent payment', async () => {
      const response = await fetch(
        `${API_URL}/api/payments/00000000-0000-0000-0000-000000000000/status`,
        {
          method: 'GET',
        }
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
    });

    test('should return updated status after completion', async () => {
      // Manually complete the payment
      await db
        .update(payments)
        .set({
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(payments.id, testPaymentId));

      const response = await fetch(
        `${API_URL}/api/payments/${testPaymentId}/status`,
        {
          method: 'GET',
        }
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect((data as any).data.status).toBe('completed');
      expect((data as any).data.completedAt).toBeTruthy();
    });
  });

  describe('Payment Retry', () => {

    let retryOrderId: string;
    let firstPaymentId: string;
    let secondPaymentId: string;

    beforeAll(async () => {
      // Create order for retry tests
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: `TEST-RETRY-${Date.now()}`,
          email: TEST_ORDER_EMAIL,
          status: 'pending',
          paymentStatus: 'pending',
          fulfillmentStatus: 'unfulfilled',
          subtotal: 8000,
          shippingCost: 0,
          taxAmount: 0,
          discountAmount: 0,
          totalAmount: 8000,
        })
        .returning();

      retryOrderId = order.id;
    });

    afterAll(async () => {
      if (retryOrderId) {
        await db.delete(payments).where(eq(payments.orderId, retryOrderId));
        await db.delete(orders).where(eq(orders.id, retryOrderId));
      }
    });

    test('should allow creating new payment after first fails', async () => {
      // Create first payment
      const firstResponse = await fetch(`${API_URL}/api/payments/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: retryOrderId,
          amount: 8000,
        }),
      });

      const firstData = await firstResponse.json();
      firstPaymentId = (firstData as any).data.paymentId;

      // Mark first payment as failed
      await db
        .update(payments)
        .set({
          status: 'failed',
          failedAt: new Date(),
        })
        .where(eq(payments.id, firstPaymentId));

      // Create second payment (retry)
      const secondResponse = await fetch(`${API_URL}/api/payments/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: retryOrderId,
          amount: 8000,
        }),
      });

      expect(secondResponse.ok).toBe(true);
      const secondData = await secondResponse.json();
      secondPaymentId = (secondData as any).data.paymentId;

      // Verify both payments exist
      expect(firstPaymentId).not.toBe(secondPaymentId);
    });

    test('should retrieve all payment attempts for order', async () => {
      const allPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.orderId, retryOrderId));

      expect(allPayments.length).toBeGreaterThanOrEqual(2);

      const failedPayment = allPayments.find(p => p.id === firstPaymentId);
      const pendingPayment = allPayments.find(p => p.id === secondPaymentId);

      expect(failedPayment?.status).toBe('failed');
      expect(pendingPayment?.status).toBe('pending');
    });
  });

  describe('Input Validation', () => {

    test('should reject invalid UUID format for order ID', async () => {
      const response = await fetch(`${API_URL}/api/payments/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: 'invalid-uuid',
          amount: 10000,
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    test('should reject negative payment amount', async () => {
      const response = await fetch(`${API_URL}/api/payments/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: testOrderId,
          amount: -100,
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    test('should reject zero payment amount', async () => {
      const response = await fetch(`${API_URL}/api/payments/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: testOrderId,
          amount: 0,
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    test('should reject missing required fields', async () => {
      const response = await fetch(`${API_URL}/api/payments/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });
});
