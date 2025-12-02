/**
 * Order Status State Machine
 * 
 * Defines valid order status transitions and enforces business rules
 * for order lifecycle management.
 */

export type OrderStatus = 
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type FulfillmentStatus = 
  | 'unfulfilled'
  | 'partially_fulfilled'
  | 'fulfilled';

export type PaymentStatus = 
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded';

export interface StatusTransitionRule {
  from: OrderStatus;
  to: OrderStatus;
  requiresNote?: boolean;
  requiresAdmin?: boolean;
  automated?: boolean;
}

export class OrderStatusStateMachine {
  private transitions: Map<OrderStatus, OrderStatus[]>;

  constructor() {
    // Define valid transitions for each status
    this.transitions = new Map([
      ['pending', ['processing', 'cancelled', 'refunded']],
      ['processing', ['shipped', 'cancelled', 'refunded']],
      ['shipped', ['delivered', 'cancelled', 'refunded']],
      ['delivered', ['refunded']],
      ['cancelled', []],
      ['refunded', []]
    ]);
  }

  /**
   * Check if a status transition is valid
   */
  isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
    const validNextStatuses = this.transitions.get(from);
    if (!validNextStatuses) {
      return false;
    }
    return validNextStatuses.includes(to);
  }

  /**
   * Get all valid next statuses for a given current status
   */
  getValidNextStatuses(current: OrderStatus): OrderStatus[] {
    return this.transitions.get(current) || [];
  }

  /**
   * Get a human-readable reason why a transition is invalid
   */
  getTransitionReason(from: OrderStatus, to: OrderStatus): string | null {
    if (this.isValidTransition(from, to)) {
      return null;
    }

    // Terminal states
    if (from === 'cancelled') {
      return 'Cannot transition from cancelled status';
    }
    if (from === 'refunded' && to !== 'refunded') {
      return 'Cannot transition from refunded status';
    }

    // Specific invalid transitions
    if (from === 'delivered' && to !== 'refunded') {
      return 'Delivered orders can only be refunded';
    }

    // Generic invalid transition
    return `Invalid transition from ${from} to ${to}`;
  }

  /**
   * Get the initial status for new orders
   */
  getInitialStatus(): OrderStatus {
    return 'pending';
  }

  /**
   * Check if a status is a terminal state
   */
  isTerminalStatus(status: OrderStatus): boolean {
    const validNext = this.transitions.get(status);
    return !validNext || validNext.length === 0;
  }

  /**
   * Get all possible order statuses
   */
  getAllStatuses(): OrderStatus[] {
    return Array.from(this.transitions.keys());
  }
}

export const orderStatusStateMachine = new OrderStatusStateMachine();
