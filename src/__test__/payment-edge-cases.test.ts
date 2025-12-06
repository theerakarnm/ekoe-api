
import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test';
import { db } from '../core/database';
import { payments, orders } from '../core/database/schema';
import { users, sessions } from '../core/database/schema/auth-schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { paymentConfig } from '../core/config/payment.config';

// Mock the auth library BEFORE importing app
mock.module('../libs/auth', () => {
  return {
    auth: {
      api: {
        getSession: async () => {
          return {
            user: { id: 'test-user-id', role: 'user', email: 'me@theerakarnm.dev', emailVerified: true },
            session: { id: 'test-session-id', userId: 'test-user-id' }
          };
        }
      }
    }
  };
});

// Import app AFTER mocking
import { app } from '../index';

const TEST_EMAIL = `payment-edge-${Date.now()}@example.com`;

let testOrderId: string;
let testPaymentId: string;
let testUserId: string;

const HEADERS = {
  'Content-Type': 'application/json',
  'Origin': 'http://localhost:3000',
  'Referer': 'http://localhost:3000/',
};

describe('Payment Edge Cases', () => {

  beforeAll(async () => {
    // Create a test user manually in DB for foreign key constraints
    testUserId = 'test-user-id'; // Must match the mocked user ID

    // Check if user exists, if not create
    const [existingUser] = await db.select().from(users).where(eq(users.id, testUserId));
    if (!existingUser) {
      await db.insert(users).values({
        id: testUserId,
        name: 'Test User',
        email: 'me@theerakarnm.dev',
        emailVerified: true,
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Create a test order
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `EDGE-${Date.now()}`,
        email: TEST_EMAIL,
        status: 'pending',
        paymentStatus: 'pending',
        fulfillmentStatus: 'unfulfilled',
        subtotal: 5000,
        shippingCost: 0,
        taxAmount: 0,
        discountAmount: 0,
        totalAmount: 5000,
      })
      .returning();

    testOrderId = order.id;

    // Create a pending payment for this order
    const [payment] = await db
      .insert(payments)
      .values({
        orderId: testOrderId,
        paymentMethod: 'promptpay',
        paymentProvider: 'promptpay',
        amount: 5000,
        currency: 'THB',
        status: 'pending',
      })
      .returning();

    testPaymentId = payment.id;
  });

  afterAll(async () => {
    if (testOrderId) {
      await db.delete(payments).where(eq(payments.orderId, testOrderId));
      await db.delete(orders).where(eq(orders.id, testOrderId));
    }
  });

  describe('Webhook Handling', () => {

    test('PromptPay: should process valid webhook and complete payment', async () => {
      const payload = {
        transactionId: `TX-${Date.now()}`,
        amount: 5000,
        currency: 'THB',
        status: 'success',
        referenceId: testPaymentId,
        metadata: {},
      };

      const payloadString = JSON.stringify(payload);
      const hmac = crypto.createHmac('sha256', paymentConfig.promptpay.webhookSecret);
      hmac.update(payloadString);
      const signature = hmac.digest('hex');

      const response = await app.request('/api/webhooks/promptpay', {
        method: 'POST',
        headers: {
          ...HEADERS,
          'x-webhook-signature': signature,
        },
        body: payloadString,
      });

      expect(response.ok).toBe(true);
      const data: any = await response.json();
      expect(data.data.received).toBe(true);

      // Verify payment status updated
      const [updatedPayment] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, testPaymentId));

      expect(updatedPayment.status).toBe('completed');
      expect(updatedPayment.transactionId).toBe(payload.transactionId);
    });

    test('PromptPay: should reject invalid signature', async () => {
      const payload = {
        transactionId: `TX-INVALID-${Date.now()}`,
        status: 'success',
        referenceId: testPaymentId,
      };

      const response = await app.request('/api/webhooks/promptpay', {
        method: 'POST',
        headers: {
          ...HEADERS,
          'x-webhook-signature': 'invalid-signature',
        },
        body: JSON.stringify(payload),
      });

      expect(response.ok).toBe(true);

      // Create another payment to test this isolation
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: `EDGE-INVALID-${Date.now()}`,
          email: TEST_EMAIL,
          status: 'pending',
          paymentStatus: 'pending',
          fulfillmentStatus: 'unfulfilled',
          subtotal: 1000,
          shippingCost: 0,
          taxAmount: 0,
          discountAmount: 0,
          totalAmount: 1000,
        })
        .returning();

      const [payment] = await db
        .insert(payments)
        .values({
          orderId: order.id,
          paymentMethod: 'promptpay',
          paymentProvider: 'promptpay',
          amount: 1000,
          currency: 'THB',
          status: 'pending',
        })
        .returning();

      const invalidPayload = {
        transactionId: `TX-FAIL-${Date.now()}`,
        status: 'success',
        referenceId: payment.id,
      };

      await app.request('/api/webhooks/promptpay', {
        method: 'POST',
        headers: {
          ...HEADERS,
          'x-webhook-signature': 'invalid',
        },
        body: JSON.stringify(invalidPayload),
      });

      const [checkPayment] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, payment.id));

      expect(checkPayment.status).toBe('pending');

      // Cleanup
      await db.delete(payments).where(eq(payments.id, payment.id));
      await db.delete(orders).where(eq(orders.id, order.id));
    });

    test('PromptPay: idempotency - should not re-process completed payment', async () => {
      const payload = {
        transactionId: `TX-${Date.now()}`,
        amount: 5000,
        currency: 'THB',
        status: 'success',
        referenceId: testPaymentId,
        metadata: {},
      };

      const payloadString = JSON.stringify(payload);
      const hmac = crypto.createHmac('sha256', paymentConfig.promptpay.webhookSecret);
      hmac.update(payloadString);
      const signature = hmac.digest('hex');

      const response = await app.request('/api/webhooks/promptpay', {
        method: 'POST',
        headers: {
          ...HEADERS,
          'x-webhook-signature': signature,
        },
        body: payloadString,
      });

      expect(response.ok).toBe(true);

      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, testPaymentId));

      expect(payment.status).toBe('completed');
    });
  });

  describe('Rate Limiting', () => {
    test('should rate limit excessive payment creation requests', async () => {
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(
          app.request('/api/payments/promptpay', {
            method: 'POST',
            headers: {
              ...HEADERS,
              'X-Forwarded-For': '10.0.0.1'
            },
            body: JSON.stringify({ orderId: testOrderId, amount: 5000 }),
          })
        );
      }

      const responses = await Promise.all(requests);
      const tooManyRequests = responses.filter(r => r.status === 429);

      if (tooManyRequests.length === 0) {
        console.log('Rate Limit Debug: All responses were', responses.map(r => r.status));
      }

      expect(tooManyRequests.length).toBeGreaterThan(0);
    });
  });

  describe('Concurrency', () => {
    test('should handle concurrent payment creation for same order', async () => {
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: `CONCUR-${Date.now()}`,
          email: TEST_EMAIL,
          status: 'pending',
          paymentStatus: 'pending',
          fulfillmentStatus: 'unfulfilled',
          subtotal: 2000,
          shippingCost: 0,
          taxAmount: 0,
          discountAmount: 0,
          totalAmount: 2000,
        })
        .returning();

      const requests = Array(5).fill(0).map(() =>
        app.request('/api/payments/promptpay', {
          method: 'POST',
          headers: {
            ...HEADERS,
            'X-Forwarded-For': '10.0.0.2'
          },
          body: JSON.stringify({ orderId: order.id, amount: 2000 }),
        })
      );

      const responses = await Promise.all(requests);
      const successes = await Promise.all(
        responses.map(async r => {
          if (!r.ok) {
            const text = await r.text();
            console.log('Concurrency Debug: Failed request', r.status, text);
            return null;
          }
          return await r.json();
        })
      );

      const successfulPayments = successes.filter(s => s && (s as any).success);

      expect(successfulPayments.length).toBeGreaterThanOrEqual(1);

      const dbPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.orderId, order.id));

      const paymentIds = new Set(dbPayments.map(p => p.id));
      expect(paymentIds.size).toBe(dbPayments.length);

      await db.delete(payments).where(eq(payments.orderId, order.id));
      await db.delete(orders).where(eq(orders.id, order.id));
    });
  });
});
