/**
 * Order Status Management API Tests
 * 
 * Tests the domain logic for order status management:
 * - updateOrderStatus - Update order status with state machine validation
 * - getValidNextStatuses - Get valid next statuses for an order
 * 
 * These tests verify:
 * - State machine validation is enforced
 * - Proper error responses for invalid transitions
 * - Valid transitions succeed
 * 
 * Note: Authentication is tested separately in auth integration tests
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { ordersDomain } from '../orders.domain';
import { ordersRepository } from '../orders.repository';
import { ValidationError } from '../../../core/errors';

// Mock the domain and repository
const mockGetOrderById = mock(() => Promise.resolve({
  id: 'test-order-id',
  orderNumber: 'ORD-123',
  email: 'me@theerakarnm.dev',
  status: 'pending',
  paymentStatus: 'pending',
  fulfillmentStatus: 'unfulfilled',
  subtotal: 10000,
  totalAmount: 10000,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [],
  shippingAddress: null,
  billingAddress: null,
}));

const mockUpdateOrderStatus = mock(() => Promise.resolve({
  orderId: 'test-order-id',
  previousStatus: 'pending',
  newStatus: 'processing',
  timestamp: new Date(),
  changedBy: 'admin-user-id',
}));

describe('Order Status Management API Logic', () => {
  beforeEach(() => {
    // Reset mocks
    mockGetOrderById.mockClear();
    mockUpdateOrderStatus.mockClear();
  });

  describe('updateOrderStatus', () => {
    test('should update order status with valid transition', async () => {
      ordersRepository.getOrderById = mockGetOrderById;
      ordersRepository.updateOrderStatus = mock(() => Promise.resolve());

      const result = await ordersDomain.updateOrderStatus(
        'test-order-id',
        { status: 'processing', note: 'Order confirmed' },
        'admin-user-id'
      );

      expect(result.orderId).toBe('test-order-id');
      expect(result.previousStatus).toBe('pending');
      expect(result.newStatus).toBe('processing');
      expect(result.changedBy).toBe('admin-user-id');
    });

    test('should reject invalid status transition', async () => {
      ordersRepository.getOrderById = mockGetOrderById;

      await expect(
        ordersDomain.updateOrderStatus(
          'test-order-id',
          { status: 'delivered' },
          'admin-user-id'
        )
      ).rejects.toThrow(ValidationError);

      await expect(
        ordersDomain.updateOrderStatus(
          'test-order-id',
          { status: 'delivered' },
          'admin-user-id'
        )
      ).rejects.toThrow('Invalid transition from pending to delivered');
    });

    test('should reject transition from cancelled status', async () => {
      ordersRepository.getOrderById = mock(() => Promise.resolve({
        id: 'test-order-id',
        orderNumber: 'ORD-123',
        email: 'me@theerakarnm.dev',
        status: 'cancelled',
        paymentStatus: 'pending',
        fulfillmentStatus: 'unfulfilled',
        subtotal: 10000,
        totalAmount: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
        shippingAddress: null,
        billingAddress: null,
      }));

      await expect(
        ordersDomain.updateOrderStatus(
          'test-order-id',
          { status: 'processing' },
          'admin-user-id'
        )
      ).rejects.toThrow('Cannot transition from cancelled status');
    });

    test('should include note in status update', async () => {
      ordersRepository.getOrderById = mockGetOrderById;
      const mockUpdate = mock(() => Promise.resolve());
      ordersRepository.updateOrderStatus = mockUpdate;

      await ordersDomain.updateOrderStatus(
        'test-order-id',
        { status: 'processing', note: 'Payment verified' },
        'admin-user-id'
      );

      expect(mockUpdate).toHaveBeenCalledWith(
        'test-order-id',
        'processing',
        'Payment verified',
        'admin-user-id'
      );
    });
  });

  describe('getValidNextStatuses', () => {
    test('should return valid next statuses for pending order', async () => {
      ordersRepository.getOrderById = mockGetOrderById;

      const validStatuses = await ordersDomain.getValidNextStatuses('test-order-id');

      expect(validStatuses).toEqual(['processing', 'cancelled', 'refunded']);
    });

    test('should return valid next statuses for delivered order', async () => {
      ordersRepository.getOrderById = mock(() => Promise.resolve({
        id: 'test-order-id',
        orderNumber: 'ORD-123',
        email: 'me@theerakarnm.dev',
        status: 'delivered',
        paymentStatus: 'paid',
        fulfillmentStatus: 'fulfilled',
        subtotal: 10000,
        totalAmount: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
        shippingAddress: null,
        billingAddress: null,
      }));

      const validStatuses = await ordersDomain.getValidNextStatuses('test-order-id');

      expect(validStatuses).toEqual(['refunded']);
    });

    test('should return empty array for terminal status (cancelled)', async () => {
      ordersRepository.getOrderById = mock(() => Promise.resolve({
        id: 'test-order-id',
        orderNumber: 'ORD-123',
        email: 'me@theerakarnm.dev',
        status: 'cancelled',
        paymentStatus: 'pending',
        fulfillmentStatus: 'unfulfilled',
        subtotal: 10000,
        totalAmount: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
        shippingAddress: null,
        billingAddress: null,
      }));

      const validStatuses = await ordersDomain.getValidNextStatuses('test-order-id');

      expect(validStatuses).toEqual([]);
    });

    test('should return empty array for terminal status (refunded)', async () => {
      ordersRepository.getOrderById = mock(() => Promise.resolve({
        id: 'test-order-id',
        orderNumber: 'ORD-123',
        email: 'me@theerakarnm.dev',
        status: 'refunded',
        paymentStatus: 'refunded',
        fulfillmentStatus: 'unfulfilled',
        subtotal: 10000,
        totalAmount: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
        shippingAddress: null,
        billingAddress: null,
      }));

      const validStatuses = await ordersDomain.getValidNextStatuses('test-order-id');

      expect(validStatuses).toEqual([]);
    });
  });
});
