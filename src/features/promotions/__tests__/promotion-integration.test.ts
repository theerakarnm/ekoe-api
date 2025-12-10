import { describe, test, expect } from 'bun:test';
import { promotionDomain } from '../promotions.domain';
import type { PromotionEvaluationContext, CartItem } from '../promotions.interface';

describe('Promotion Integration', () => {
  test('should integrate promotion domain with engine', async () => {
    const cartItems: CartItem[] = [
      {
        productId: 'product-1',
        quantity: 2,
        unitPrice: 5000,
        subtotal: 10000,
        categoryIds: ['category-1']
      }
    ];

    const context: PromotionEvaluationContext = {
      cartItems,
      cartSubtotal: 10000,
      customerId: 'customer-1'
    };

    // This should work without errors even if no promotions are active
    const result = await promotionDomain.evaluatePromotions(context);
    
    expect(result).toBeDefined();
    expect(result.eligiblePromotions).toBeArray();
    expect(result.totalDiscount).toBeNumber();
    expect(result.freeGifts).toBeArray();
  });
});