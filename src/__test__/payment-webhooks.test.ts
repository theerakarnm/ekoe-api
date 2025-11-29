/**
 * Payment Webhook Handling Tests
 * 
 * These tests verify webhook processing:
 * - Valid webhook processing
 * - Invalid signature rejection
 * - Idempotency (duplicate webhooks)
 * - Concurrent webhook handling
 * - Webhook error scenarios
 * 
 * Prerequisites:
 * - Database running with migrations applied
 * - Test environment configured
 * 
 * Run with: bun test src/__test__/payment-webhooks.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { db } from '../core/database';
import { payments, orders } from '../core/database/schema';
import { eq } from 'drizzle-orm';
import { paymentsRepository } from '../features/payments/payments.repository';
import crypto from 'crypto';
import { ordersRepository } from '../features/orders/orders.repository';

const API_URL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
const TEST_ORDER_EMAIL = `webhook-test-${Date.now()}@example.com`;
const PROMPTPAY_WEBHOOK_SECRET = process.env.PROMPTPAY_WEBHOOK_SECRET || 'test-promptpay-secret';
const TWOC2P_SECRET_KEY = process.env.TWOC2P_SECRET_KEY || 'test-2c2p-secret';

let testOrderId: string;
let testPaymentId: string;

describe('Payment Webhook Tests', () => {
  
  // Setup: Create test order directly in database
  beforeAll(async () => {
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `TEST-WEBHOOK-${Date.now()}`,
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

  describe('PromptPay Webhook Processing', () => {
    
    beforeAll(async () => {
      // Create payment for webhook tests
      const payment = await paymentsRepository.createPayment({
        orderId: testOrderId,
        paymentMethod: 'promptpay',
        paymentProvider: 'promptpay',
        amount: 10000,
        currency: 'THB',
      });
      testPaymentId = payment.id;
    });

    test('should process valid PromptPay webhook', async () => {
      const webhookPayload = {
        transactionId: `TXN-${Date.now()}`,
        amount: 100, // Amount in THB
        currency: 'THB',
        status: 'success',
        referenceId: testPaymentId,
        timestamp: new Date().toISOString(),
      };

      // Generate valid signature
      const payloadString = JSON.stringify(webhookPayload);
      const hmac = crypto.createHmac('sha256', PROMPTPAY_WEBHOOK_SECRET);
      hmac.update(payloadString);
      const signature = hmac.digest('hex');

      const response = await fetch(`${API_URL}/api/webhooks/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
        },
        body: payloadString,
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      // Verify payment was updated
      const payment = await paymentsRepository.getPaymentById(testPaymentId);
      expect(payment?.status).toBe('completed');
      expect(payment?.transactionId).toBe(webhookPayload.transactionId);
      expect(payment?.completedAt).toBeTruthy();

      // Verify order was updated
      const order = await ordersRepository.getOrderById(testOrderId);
      expect(order?.paymentStatus).toBe('paid');
      expect(order?.paidAt).toBeTruthy();
    });

    test('should reject webhook with invalid signature', async () => {
      const webhookPayload = {
        transactionId: `TXN-${Date.now()}`,
        amount: 100,
        currency: 'THB',
        status: 'success',
        referenceId: testPaymentId,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(`${API_URL}/api/webhooks/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': 'invalid-signature-12345',
        },
        body: JSON.stringify(webhookPayload),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    test('should reject webhook with missing signature', async () => {
      const webhookPayload = {
        transactionId: `TXN-${Date.now()}`,
        amount: 100,
        currency: 'THB',
        status: 'success',
        referenceId: testPaymentId,
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(`${API_URL}/api/webhooks/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    test('should handle webhook for non-existent payment', async () => {
      const webhookPayload = {
        transactionId: `TXN-${Date.now()}`,
        amount: 100,
        currency: 'THB',
        status: 'success',
        referenceId: '00000000-0000-0000-0000-000000000000',
        timestamp: new Date().toISOString(),
      };

      const payloadString = JSON.stringify(webhookPayload);
      const hmac = crypto.createHmac('sha256', PROMPTPAY_WEBHOOK_SECRET);
      hmac.update(payloadString);
      const signature = hmac.digest('hex');

      const response = await fetch(`${API_URL}/api/webhooks/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
        },
        body: payloadString,
      });

      // Should return 200 to acknowledge receipt but log error
      expect(response.status).toBe(200);
    });

    test('should handle failed payment webhook', async () => {
      // Create new payment for failure test
      const failPayment = await paymentsRepository.createPayment({
        orderId: testOrderId,
        paymentMethod: 'promptpay',
        paymentProvider: 'promptpay',
        amount: 10000,
        currency: 'THB',
      });

      const webhookPayload = {
        transactionId: `TXN-FAIL-${Date.now()}`,
        amount: 100,
        currency: 'THB',
        status: 'failed',
        referenceId: failPayment.id,
        timestamp: new Date().toISOString(),
      };

      const payloadString = JSON.stringify(webhookPayload);
      const hmac = crypto.createHmac('sha256', PROMPTPAY_WEBHOOK_SECRET);
      hmac.update(payloadString);
      const signature = hmac.digest('hex');

      const response = await fetch(`${API_URL}/api/webhooks/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
        },
        body: payloadString,
      });

      expect(response.ok).toBe(true);

      // Verify payment was marked as failed
      const payment = await paymentsRepository.getPaymentById(failPayment.id);
      expect(payment?.status).toBe('failed');
      expect(payment?.failedAt).toBeTruthy();
    });
  });

  describe('2C2P Webhook Processing', () => {
    
    let test2C2POrderId: string;
    let test2C2PPaymentId: string;

    beforeAll(async () => {
      // Create separate order for 2C2P tests
      const [order] = await db
        .insert(orders)
        .values({
          orderNumber: `TEST-2C2P-WEBHOOK-${Date.now()}`,
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

      // Create payment
      const payment = await paymentsRepository.createPayment({
        orderId: test2C2POrderId,
        paymentMethod: 'credit_card',
        paymentProvider: '2c2p',
        amount: 15000,
        currency: 'THB',
      });
      test2C2PPaymentId = payment.id;
    });

    afterAll(async () => {
      if (test2C2POrderId) {
        await db.delete(payments).where(eq(payments.orderId, test2C2POrderId));
        await db.delete(orders).where(eq(orders.id, test2C2POrderId));
      }
    });

    test('should process valid 2C2P webhook', async () => {
      const merchantId = process.env.TWOC2P_MERCHANT_ID || 'test-merchant';
      const transactionRef = `2C2P-${Date.now()}`;
      
      // Build webhook payload
      const webhookPayload = {
        version: '1.0',
        merchant_id: merchantId,
        order_id: test2C2PPaymentId,
        payment_status: '000', // Success code
        transaction_ref: transactionRef,
        amount: '150.00',
        currency: 'THB',
        card_number: '************1234',
        card_brand: 'VISA',
      };

      // Generate hash (simplified - actual 2C2P uses specific fields)
      const hashString = `${webhookPayload.version}${webhookPayload.merchant_id}${webhookPayload.order_id}${webhookPayload.payment_status}${webhookPayload.amount}${webhookPayload.currency}`;
      const hmac = crypto.createHmac('sha256', TWOC2P_SECRET_KEY);
      hmac.update(hashString);
      const hash = hmac.digest('hex');

      webhookPayload.hash_value = hash;

      const response = await fetch(`${API_URL}/api/webhooks/2c2p`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload),
      });

      expect(response.ok).toBe(true);

      // Verify payment was updated
      const payment = await paymentsRepository.getPaymentById(test2C2PPaymentId);
      expect(payment?.status).toBe('completed');
      expect(payment?.transactionId).toBe(transactionRef);
      expect(payment?.cardLast4).toBe('1234');
      expect(payment?.cardBrand).toBe('VISA');
    });

    test('should reject 2C2P webhook with invalid hash', async () => {
      const webhookPayload = {
        version: '1.0',
        merchant_id: 'test-merchant',
        order_id: test2C2PPaymentId,
        payment_status: '000',
        transaction_ref: `2C2P-${Date.now()}`,
        amount: '150.00',
        currency: 'THB',
        hash_value: 'invalid-hash-12345',
      };

      const response = await fetch(`${API_URL}/api/webhooks/2c2p`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(webhookPayload),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });

  describe('Webhook Idempotency', () => {
    
    let idempotencyPaymentId: string;
    const transactionId = `TXN-IDEMPOTENT-${Date.now()}`;

    beforeAll(async () => {
      // Create payment for idempotency tests
      const payment = await paymentsRepository.createPayment({
        orderId: testOrderId,
        paymentMethod: 'promptpay',
        paymentProvider: 'promptpay',
        amount: 10000,
        currency: 'THB',
      });
      idempotencyPaymentId = payment.id;
    });

    test('should process webhook first time', async () => {
      const webhookPayload = {
        transactionId,
        amount: 100,
        currency: 'THB',
        status: 'success',
        referenceId: idempotencyPaymentId,
        timestamp: new Date().toISOString(),
      };

      const payloadString = JSON.stringify(webhookPayload);
      const hmac = crypto.createHmac('sha256', PROMPTPAY_WEBHOOK_SECRET);
      hmac.update(payloadString);
      const signature = hmac.digest('hex');

      const response = await fetch(`${API_URL}/api/webhooks/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
        },
        body: payloadString,
      });

      expect(response.ok).toBe(true);

      // Verify payment was completed
      const payment = await paymentsRepository.getPaymentById(idempotencyPaymentId);
      expect(payment?.status).toBe('completed');
      expect(payment?.transactionId).toBe(transactionId);
    });

    test('should ignore duplicate webhook (idempotency)', async () => {
      // Send same webhook again
      const webhookPayload = {
        transactionId,
        amount: 100,
        currency: 'THB',
        status: 'success',
        referenceId: idempotencyPaymentId,
        timestamp: new Date().toISOString(),
      };

      const payloadString = JSON.stringify(webhookPayload);
      const hmac = crypto.createHmac('sha256', PROMPTPAY_WEBHOOK_SECRET);
      hmac.update(payloadString);
      const signature = hmac.digest('hex');

      const response = await fetch(`${API_URL}/api/webhooks/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
        },
        body: payloadString,
      });

      // Should still return 200 (acknowledged)
      expect(response.ok).toBe(true);

      // Verify payment status unchanged
      const payment = await paymentsRepository.getPaymentById(idempotencyPaymentId);
      expect(payment?.status).toBe('completed');
    });

    test('should handle concurrent duplicate webhooks', async () => {
      // Create new payment for concurrent test
      const concurrentPayment = await paymentsRepository.createPayment({
        orderId: testOrderId,
        paymentMethod: 'promptpay',
        paymentProvider: 'promptpay',
        amount: 10000,
        currency: 'THB',
      });

      const concurrentTxnId = `TXN-CONCURRENT-${Date.now()}`;
      const webhookPayload = {
        transactionId: concurrentTxnId,
        amount: 100,
        currency: 'THB',
        status: 'success',
        referenceId: concurrentPayment.id,
        timestamp: new Date().toISOString(),
      };

      const payloadString = JSON.stringify(webhookPayload);
      const hmac = crypto.createHmac('sha256', PROMPTPAY_WEBHOOK_SECRET);
      hmac.update(payloadString);
      const signature = hmac.digest('hex');

      // Send multiple webhooks concurrently
      const requests = Array(3).fill(null).map(() =>
        fetch(`${API_URL}/api/webhooks/promptpay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
          },
          body: payloadString,
        })
      );

      const responses = await Promise.all(requests);

      // All should return 200
      responses.forEach(response => {
        expect(response.ok).toBe(true);
      });

      // Verify payment was only completed once
      const payment = await paymentsRepository.getPaymentById(concurrentPayment.id);
      expect(payment?.status).toBe('completed');
      expect(payment?.transactionId).toBe(concurrentTxnId);
    });
  });

  describe('Webhook Error Scenarios', () => {
    
    test('should handle malformed JSON payload', async () => {
      const response = await fetch(`${API_URL}/api/webhooks/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': 'some-signature',
        },
        body: 'invalid-json{',
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    test('should handle missing required fields', async () => {
      const webhookPayload = {
        transactionId: `TXN-${Date.now()}`,
        // Missing other required fields
      };

      const payloadString = JSON.stringify(webhookPayload);
      const hmac = crypto.createHmac('sha256', PROMPTPAY_WEBHOOK_SECRET);
      hmac.update(payloadString);
      const signature = hmac.digest('hex');

      const response = await fetch(`${API_URL}/api/webhooks/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
        },
        body: payloadString,
      });

      // Should return 200 to acknowledge but log error
      expect(response.status).toBe(200);
    });

    test('should return 200 even on processing errors', async () => {
      // This ensures webhook providers don't retry indefinitely
      const webhookPayload = {
        transactionId: `TXN-${Date.now()}`,
        amount: 100,
        currency: 'THB',
        status: 'success',
        referenceId: '00000000-0000-0000-0000-000000000000', // Non-existent
        timestamp: new Date().toISOString(),
      };

      const payloadString = JSON.stringify(webhookPayload);
      const hmac = crypto.createHmac('sha256', PROMPTPAY_WEBHOOK_SECRET);
      hmac.update(payloadString);
      const signature = hmac.digest('hex');

      const response = await fetch(`${API_URL}/api/webhooks/promptpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
        },
        body: payloadString,
      });

      // Should return 200 to prevent retries
      expect(response.status).toBe(200);
    });
  });
});
