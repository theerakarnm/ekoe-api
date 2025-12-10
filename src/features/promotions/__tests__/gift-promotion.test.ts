import { describe, test, expect } from 'bun:test';
import { promotionalCartService } from '../../cart/promotional-cart.service';

describe('Gift Promotion Unit Tests', () => {

  test('should integrate gift promotion with cart service', async () => {
    const cartItems = [
      {
        productId: 'test-product-1',
        quantity: 2,
      },
    ];

    // Test that promotional cart service can handle gift items
    const promotionalItems = await promotionalCartService['addPromotionalGiftsToCart'](
      cartItems,
      [
        {
          productId: 'test-gift-product-1',
          quantity: 1,
          name: 'Test Gift',
          value: 0,
        },
      ],
      {
        promotionId: 'test-promotion-id',
        promotionName: 'Test Promotion',
        discountAmount: 0,
        freeGifts: [],
        appliedAt: new Date(),
      }
    );
    
    expect(promotionalItems).toHaveLength(2); // Original item + gift item
    expect(promotionalItems[1].isPromotionalGift).toBe(true);
    expect(promotionalItems[1].sourcePromotionId).toBe('test-promotion-id');
    expect(promotionalItems[1].productId).toBe('test-gift-product-1');
  });

  test('should validate gift removal protection', () => {
    const giftItem = {
      productId: 'test-gift-product-1',
      quantity: 1,
      isPromotionalGift: true,
      sourcePromotionId: 'test-promotion-id',
    };

    const regularItem = {
      productId: 'test-product-1',
      quantity: 1,
    };

    const giftValidation = promotionalCartService.validateGiftRemoval(giftItem);
    const regularValidation = promotionalCartService.validateGiftRemoval(regularItem);

    expect(giftValidation.canRemove).toBe(false);
    expect(giftValidation.reason).toContain('cannot be removed manually');
    
    expect(regularValidation.canRemove).toBe(true);
    expect(regularValidation.reason).toBeUndefined();
  });

  test('should generate correct gift display information', () => {
    const giftItem = {
      productId: 'test-gift-product-1',
      quantity: 1,
      isPromotionalGift: true,
      sourcePromotionId: 'test-promotion-id',
      giftValue: 500,
    };

    const regularItem = {
      productId: 'test-product-1',
      quantity: 1,
    };

    const giftDisplay = promotionalCartService.getGiftDisplayInfo(giftItem);
    const regularDisplay = promotionalCartService.getGiftDisplayInfo(regularItem);

    expect(giftDisplay.isGift).toBe(true);
    expect(giftDisplay.giftLabel).toBe('FREE GIFT');
    expect(giftDisplay.giftValue).toBe(500);
    
    expect(regularDisplay.isGift).toBe(false);
    expect(regularDisplay.giftLabel).toBeUndefined();
  });

  test('should calculate promotional gift summary correctly', () => {
    const items = [
      {
        productId: 'test-product-1',
        quantity: 1,
      },
      {
        productId: 'test-gift-1',
        quantity: 1,
        isPromotionalGift: true,
        sourcePromotionId: 'promo-1',
        giftValue: 500,
      },
      {
        productId: 'test-gift-2',
        quantity: 2,
        isPromotionalGift: true,
        sourcePromotionId: 'promo-1',
        giftValue: 300,
      },
    ];

    const summary = promotionalCartService.getPromotionalGiftSummary(items);

    expect(summary.totalGifts).toBe(2); // 2 gift items (not counting quantities)
    expect(summary.totalGiftValue).toBe(800); // 500 + 300
    expect(summary.giftsByPromotion.has('promo-1')).toBe(true);
    
    const promoSummary = summary.giftsByPromotion.get('promo-1')!;
    expect(promoSummary.count).toBe(3); // 1 + 2 quantities
    expect(promoSummary.value).toBe(800);
    expect(promoSummary.items).toHaveLength(2);
  });
});