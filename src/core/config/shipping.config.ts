/**
 * Shipping Methods Configuration
 * 
 * Defines available shipping methods with costs and delivery estimates.
 * All costs are in cents (e.g., 5000 = 50.00 THB)
 */

export interface ShippingMethod {
  id: string;
  name: string;
  description: string;
  cost: number; // in cents
  estimatedDays: number;
  carrier?: string;
}

export const SHIPPING_METHODS: ShippingMethod[] = [
  {
    id: 'standard',
    name: 'Express Shipping',
    description: 'Delivery within 3-5 business days',
    cost: 0,
    estimatedDays: 3,
    carrier: '-',
  },
  // {
  //   id: 'express',
  //   name: 'Express Shipping',
  //   description: 'Delivery within 2-3 business days',
  //   cost: 0, // 100 THB
  //   estimatedDays: 3,
  //   carrier: 'Kerry Express',
  // },
  // {
  //   id: 'next-day',
  //   name: 'Next Day Delivery',
  //   description: 'Delivery by next business day',
  //   cost: 15000, // 150 THB
  //   estimatedDays: 1,
  //   carrier: 'Flash Express',
  // },
];

/**
 * Get shipping method by ID
 */
export function getShippingMethodById(id: string): ShippingMethod | undefined {
  return SHIPPING_METHODS.find((method) => method.id === id);
}

/**
 * Get all available shipping methods
 */
export function getAllShippingMethods(): ShippingMethod[] {
  return SHIPPING_METHODS;
}

/**
 * Calculate shipping cost based on method ID
 * Returns 0 if method not found
 */
export function calculateShippingCost(methodId: string): number {
  const method = getShippingMethodById(methodId);
  return method?.cost || 0;
}

/**
 * Validate shipping method ID
 */
export function isValidShippingMethod(methodId: string): boolean {
  return SHIPPING_METHODS.some((method) => method.id === methodId);
}
