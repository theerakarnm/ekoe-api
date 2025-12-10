import { describe, test, expect, beforeEach } from 'bun:test';
import { promotionEngine } from '../promotion-engine';
import type { PromotionEvaluationContext, CartItem } from '../promotions.interface';

describe('PromotionEngine', () => {
  let mockContext: PromotionEvaluationContext;

  beforeEach(() => {
    // Setup a basic cart context for testing
    const cartItems: CartItem[] = [
      {
        productId: 'product-1',
        quantity: 2,
        unitPrice: 5000, // 50 THB
        subtotal: 10000, // 100 THB
        categoryIds: ['category-1']
      },
      {
        productId: 'product-2',
        quantity: 1,
        unitPrice: 15000, // 150 THB
        subtotal: 15000, // 150 THB
        categoryIds: ['category-2']
      }
    ];

    mockContext = {
      cartItems,
      cartSubtotal: 25000, // 250 THB total
      customerId: 'customer-1'
    };
  });

  test('should validate evaluation context correctly', async () => {
    // Test with valid context
    const result = await promotionEngine.evaluatePromotions(mockContext);
    expect(result).toBeDefined();
    expect(result.eligiblePromotions).toBeArray();
    expect(result.totalDiscount).toBeNumber();
    expect(result.freeGifts).toBeArray();
  });

  test('should handle empty cart items', async () => {
    const emptyContext = {
      ...mockContext,
      cartItems: [],
      cartSubtotal: 0
    };

    const result = await promotionEngine.evaluatePromotions(emptyContext);
    expect(result.eligiblePromotions).toHaveLength(0);
    expect(result.totalDiscount).toBe(0);
    expect(result.freeGifts).toHaveLength(0);
  });

  test('should validate cart item structure', async () => {
    const invalidContext = {
      ...mockContext,
      cartItems: [
        {
          productId: '', // Invalid empty product ID
          quantity: 2,
          unitPrice: 5000,
          subtotal: 10000
        }
      ] as CartItem[]
    };

    await expect(promotionEngine.evaluatePromotions(invalidContext)).rejects.toThrow();
  });

  test('should validate negative quantities', async () => {
    const invalidContext = {
      ...mockContext,
      cartItems: [
        {
          productId: 'product-1',
          quantity: -1, // Invalid negative quantity
          unitPrice: 5000,
          subtotal: 10000
        }
      ] as CartItem[]
    };

    await expect(promotionEngine.evaluatePromotions(invalidContext)).rejects.toThrow();
  });

  test('should validate negative subtotal', async () => {
    const invalidContext = {
      ...mockContext,
      cartSubtotal: -100 // Invalid negative subtotal
    };

    await expect(promotionEngine.evaluatePromotions(invalidContext)).rejects.toThrow();
  });
});