import { describe, test, expect } from 'bun:test';
import { OrderStatusStateMachine, type OrderStatus } from '../order-status-state-machine';

describe('OrderStatusStateMachine', () => {
  const stateMachine = new OrderStatusStateMachine();

  describe('getInitialStatus', () => {
    test('should return pending as initial status', () => {
      expect(stateMachine.getInitialStatus()).toBe('pending');
    });
  });

  describe('isValidTransition', () => {
    test('should allow valid transitions from pending', () => {
      expect(stateMachine.isValidTransition('pending', 'processing')).toBe(true);
      expect(stateMachine.isValidTransition('pending', 'cancelled')).toBe(true);
      expect(stateMachine.isValidTransition('pending', 'refunded')).toBe(true);
    });

    test('should reject invalid transitions from pending', () => {
      expect(stateMachine.isValidTransition('pending', 'shipped')).toBe(false);
      expect(stateMachine.isValidTransition('pending', 'delivered')).toBe(false);
    });

    test('should allow valid transitions from processing', () => {
      expect(stateMachine.isValidTransition('processing', 'shipped')).toBe(true);
      expect(stateMachine.isValidTransition('processing', 'cancelled')).toBe(true);
      expect(stateMachine.isValidTransition('processing', 'refunded')).toBe(true);
    });

    test('should reject invalid transitions from processing', () => {
      expect(stateMachine.isValidTransition('processing', 'pending')).toBe(false);
      expect(stateMachine.isValidTransition('processing', 'delivered')).toBe(false);
    });

    test('should allow valid transitions from shipped', () => {
      expect(stateMachine.isValidTransition('shipped', 'delivered')).toBe(true);
      expect(stateMachine.isValidTransition('shipped', 'cancelled')).toBe(true);
      expect(stateMachine.isValidTransition('shipped', 'refunded')).toBe(true);
    });

    test('should only allow refunded from delivered', () => {
      expect(stateMachine.isValidTransition('delivered', 'refunded')).toBe(true);
      expect(stateMachine.isValidTransition('delivered', 'pending')).toBe(false);
      expect(stateMachine.isValidTransition('delivered', 'processing')).toBe(false);
      expect(stateMachine.isValidTransition('delivered', 'shipped')).toBe(false);
      expect(stateMachine.isValidTransition('delivered', 'cancelled')).toBe(false);
    });

    test('should not allow any transitions from cancelled', () => {
      expect(stateMachine.isValidTransition('cancelled', 'pending')).toBe(false);
      expect(stateMachine.isValidTransition('cancelled', 'processing')).toBe(false);
      expect(stateMachine.isValidTransition('cancelled', 'shipped')).toBe(false);
      expect(stateMachine.isValidTransition('cancelled', 'delivered')).toBe(false);
      expect(stateMachine.isValidTransition('cancelled', 'refunded')).toBe(false);
    });

    test('should not allow any transitions from refunded', () => {
      expect(stateMachine.isValidTransition('refunded', 'pending')).toBe(false);
      expect(stateMachine.isValidTransition('refunded', 'processing')).toBe(false);
      expect(stateMachine.isValidTransition('refunded', 'shipped')).toBe(false);
      expect(stateMachine.isValidTransition('refunded', 'delivered')).toBe(false);
      expect(stateMachine.isValidTransition('refunded', 'cancelled')).toBe(false);
    });
  });

  describe('getValidNextStatuses', () => {
    test('should return correct valid next statuses for pending', () => {
      const validNext = stateMachine.getValidNextStatuses('pending');
      expect(validNext).toEqual(['processing', 'cancelled', 'refunded']);
    });

    test('should return correct valid next statuses for processing', () => {
      const validNext = stateMachine.getValidNextStatuses('processing');
      expect(validNext).toEqual(['shipped', 'cancelled', 'refunded']);
    });

    test('should return correct valid next statuses for shipped', () => {
      const validNext = stateMachine.getValidNextStatuses('shipped');
      expect(validNext).toEqual(['delivered', 'cancelled', 'refunded']);
    });

    test('should return only refunded for delivered', () => {
      const validNext = stateMachine.getValidNextStatuses('delivered');
      expect(validNext).toEqual(['refunded']);
    });

    test('should return empty array for cancelled', () => {
      const validNext = stateMachine.getValidNextStatuses('cancelled');
      expect(validNext).toEqual([]);
    });

    test('should return empty array for refunded', () => {
      const validNext = stateMachine.getValidNextStatuses('refunded');
      expect(validNext).toEqual([]);
    });
  });

  describe('getTransitionReason', () => {
    test('should return null for valid transitions', () => {
      expect(stateMachine.getTransitionReason('pending', 'processing')).toBeNull();
      expect(stateMachine.getTransitionReason('processing', 'shipped')).toBeNull();
    });

    test('should return reason for invalid transitions from cancelled', () => {
      const reason = stateMachine.getTransitionReason('cancelled', 'pending');
      expect(reason).toBe('Cannot transition from cancelled status');
    });

    test('should return reason for invalid transitions from delivered', () => {
      const reason = stateMachine.getTransitionReason('delivered', 'pending');
      expect(reason).toBe('Delivered orders can only be refunded');
    });

    test('should return generic reason for other invalid transitions', () => {
      const reason = stateMachine.getTransitionReason('pending', 'delivered');
      expect(reason).toBe('Invalid transition from pending to delivered');
    });
  });

  describe('isTerminalStatus', () => {
    test('should identify cancelled as terminal', () => {
      expect(stateMachine.isTerminalStatus('cancelled')).toBe(true);
    });

    test('should identify refunded as terminal', () => {
      expect(stateMachine.isTerminalStatus('refunded')).toBe(true);
    });

    test('should not identify pending as terminal', () => {
      expect(stateMachine.isTerminalStatus('pending')).toBe(false);
    });

    test('should not identify processing as terminal', () => {
      expect(stateMachine.isTerminalStatus('processing')).toBe(false);
    });

    test('should not identify shipped as terminal', () => {
      expect(stateMachine.isTerminalStatus('shipped')).toBe(false);
    });

    test('should not identify delivered as terminal (can be refunded)', () => {
      expect(stateMachine.isTerminalStatus('delivered')).toBe(false);
    });
  });

  describe('getAllStatuses', () => {
    test('should return all possible statuses', () => {
      const allStatuses = stateMachine.getAllStatuses();
      expect(allStatuses).toContain('pending');
      expect(allStatuses).toContain('processing');
      expect(allStatuses).toContain('shipped');
      expect(allStatuses).toContain('delivered');
      expect(allStatuses).toContain('cancelled');
      expect(allStatuses).toContain('refunded');
      expect(allStatuses.length).toBe(6);
    });
  });
});
