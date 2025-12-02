import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { OrdersDomain } from '../orders.domain';
import { ordersRepository } from '../orders.repository';
import type { PaymentEvent } from '../orders.interface';

// Mock the repository
const mockGetOrderById = mock(() => Promise.resolve({
  id: 'test-order-id',
  orderNumber: 'ORD-123',
  email: 'test@example.com',
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
  id: 'test-order-id',
  orderNumber: 'ORD-123',
  email: 'test@example.com',
  status: 'processing',
  paymentStatus: 'pending',
  fulfillmentStatus: 'unfulfilled',
  subtotal: 10000,
  totalAmount: 10000,
  createdAt: new Date(),
  updatedAt: new Date(),
}));

const mockCreateStatusHistoryEntry = mock(() => Promise.resolve({
  id: 'history-id',
  orderId: 'test-order-id',
  status: 'pending',
  note: 'Payment failed',
  changedBy: 'system',
  createdAt: new Date(),
}));

describe('OrdersDomain - State Machine Integration', () => {
  let ordersDomain: OrdersDomain;

  beforeEach(() => {
    ordersDomain = new OrdersDomain();
    // Reset mocks
    mockGetOrderById.mockClear();
    mockUpdateOrderStatus.mockClear();
    mockCreateStatusHistoryEntry.mockClear();
  });

  describe('updateOrderStatus', () => {
    test('should allow valid status transitions', async () => {
      // Mock repository methods
      ordersRepository.getOrderById = mockGetOrderById;
      ordersRepository.updateOrderStatus = mockUpdateOrderStatus;

      const result = await ordersDomain.updateOrderStatus(
        'test-order-id',
        { status: 'processing' },
        'admin-user-id'
      );

      expect(result.previousStatus).toBe('pending');
      expect(result.newStatus).toBe('processing');
      expect(result.orderId).toBe('test-order-id');
      expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
        'test-order-id',
        'processing',
        undefined,
        'admin-user-id'
      );
    });

    test('should reject invalid status transitions', async () => {
      ordersRepository.getOrderById = mockGetOrderById;

      await expect(
        ordersDomain.updateOrderStatus(
          'test-order-id',
          { status: 'delivered' },
          'admin-user-id'
        )
      ).rejects.toThrow('Invalid transition from pending to delivered');
    });

    test('should reject transitions from cancelled status', async () => {
      ordersRepository.getOrderById = mock(() => Promise.resolve({
        id: 'test-order-id',
        orderNumber: 'ORD-123',
        email: 'test@example.com',
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
        email: 'test@example.com',
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
  });

  describe('handlePaymentEvent', () => {
    test('should transition from pending to processing on payment completion', async () => {
      ordersRepository.getOrderById = mockGetOrderById;
      ordersRepository.updateOrderStatus = mockUpdateOrderStatus;

      const event: PaymentEvent = {
        type: 'payment_completed',
        orderId: 'test-order-id',
        timestamp: new Date(),
      };

      await ordersDomain.handlePaymentEvent(event);

      expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
        'test-order-id',
        'processing',
        'Payment completed successfully',
        'system'
      );
    });

    test('should keep order in pending status on payment failure', async () => {
      ordersRepository.getOrderById = mockGetOrderById;
      ordersRepository.createStatusHistoryEntry = mockCreateStatusHistoryEntry;

      const event: PaymentEvent = {
        type: 'payment_failed',
        orderId: 'test-order-id',
        timestamp: new Date(),
        metadata: { reason: 'Insufficient funds' },
      };

      await ordersDomain.handlePaymentEvent(event);

      expect(mockCreateStatusHistoryEntry).toHaveBeenCalledWith(
        'test-order-id',
        'pending',
        'Payment failed: Insufficient funds',
        'system'
      );
    });

    test('should transition to refunded on refund processed', async () => {
      ordersRepository.getOrderById = mock(() => Promise.resolve({
        id: 'test-order-id',
        orderNumber: 'ORD-123',
        email: 'test@example.com',
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
      ordersRepository.updateOrderStatus = mockUpdateOrderStatus;

      const event: PaymentEvent = {
        type: 'refund_processed',
        orderId: 'test-order-id',
        timestamp: new Date(),
      };

      await ordersDomain.handlePaymentEvent(event);

      expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
        'test-order-id',
        'refunded',
        'Refund processed successfully',
        'system'
      );
    });

    test('should not change status on payment completion if not in pending', async () => {
      ordersRepository.getOrderById = mock(() => Promise.resolve({
        id: 'test-order-id',
        orderNumber: 'ORD-123',
        email: 'test@example.com',
        status: 'processing',
        paymentStatus: 'paid',
        fulfillmentStatus: 'unfulfilled',
        subtotal: 10000,
        totalAmount: 10000,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [],
        shippingAddress: null,
        billingAddress: null,
      }));
      ordersRepository.updateOrderStatus = mockUpdateOrderStatus;

      const event: PaymentEvent = {
        type: 'payment_completed',
        orderId: 'test-order-id',
        timestamp: new Date(),
      };

      await ordersDomain.handlePaymentEvent(event);

      // Should not call updateOrderStatus since order is already processing
      expect(mockUpdateOrderStatus).not.toHaveBeenCalled();
    });
  });
});
