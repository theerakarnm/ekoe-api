import { promotionEngine } from '../promotions/promotion-engine';
import { cartDomain } from './cart.domain';
import { ValidationError } from '../../core/errors';
import type {
  CartItemInput,
  ValidatedCart,
  CartPricing,
} from './cart.interface';
import type {
  PromotionEvaluationContext,
  FreeGift,
  AppliedPromotion,
} from '../promotions/promotions.interface';

export interface PromotionalCartItem extends CartItemInput {
  isPromotionalGift?: boolean;
  sourcePromotionId?: string;
  giftValue?: number;
}

export interface PromotionalCartResult {
  items: PromotionalCartItem[];
  appliedPromotions: AppliedPromotion[];
  totalDiscount: number;
  freeGifts: FreeGift[];
  pricing: CartPricing;
}

export class PromotionalCartService {
  /**
   * Evaluate cart with automatic promotion application and gift management
   */
  async evaluateCartWithPromotions(
    items: CartItemInput[],
    customerId?: string,
    discountCode?: string,
    shippingMethod?: string
  ): Promise<PromotionalCartResult> {
    // First validate the base cart items (non-promotional)
    const baseItems = items.filter(item => !this.isPromotionalGift(item));
    const validatedCart = await cartDomain.validateCart(baseItems);

    if (!validatedCart.isValid) {
      throw new ValidationError('Cart validation failed', {
        errors: validatedCart.errors,
      });
    }

    // Create promotion evaluation context
    const evaluationContext: PromotionEvaluationContext = {
      cartItems: validatedCart.items.map(item => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        categoryIds: [], // TODO: Add category information if needed
      })),
      cartSubtotal: validatedCart.subtotal,
      customerId,
    };

    // Evaluate promotions
    const promotionResult = await promotionEngine.evaluatePromotions(evaluationContext);

    // Create updated cart with promotional gifts
    const updatedItems = await this.addPromotionalGiftsToCart(
      baseItems,
      promotionResult.freeGifts,
      promotionResult.selectedPromotion
    );

    // Calculate final pricing including promotions
    const pricing = await cartDomain.calculateCartPricing(
      baseItems, // Use base items for pricing calculation
      discountCode,
      shippingMethod
    );

    // Apply promotional discounts to pricing
    const finalPricing = this.applyPromotionalDiscounts(pricing, promotionResult);

    return {
      items: updatedItems,
      appliedPromotions: promotionResult.selectedPromotion ? [promotionResult.selectedPromotion] : [],
      totalDiscount: promotionResult.totalDiscount + (pricing.discountAmount || 0),
      freeGifts: promotionResult.freeGifts,
      pricing: finalPricing,
    };
  }

  /**
   * Add promotional gift items to cart automatically
   */
  private async addPromotionalGiftsToCart(
    baseItems: CartItemInput[],
    freeGifts: FreeGift[],
    appliedPromotion?: AppliedPromotion
  ): Promise<PromotionalCartItem[]> {
    const updatedItems: PromotionalCartItem[] = [...baseItems];

    // Add free gifts as promotional items
    for (const gift of freeGifts) {
      const giftItem: PromotionalCartItem = {
        productId: gift.productId,
        variantId: gift.variantId,
        quantity: gift.quantity,
        isPromotionalGift: true,
        sourcePromotionId: appliedPromotion?.promotionId,
        giftValue: gift.value,
      };

      updatedItems.push(giftItem);
    }

    return updatedItems;
  }

  /**
   * Remove promotional gift items from cart when conditions no longer met
   */
  async removeIneligiblePromotionalGifts(
    items: PromotionalCartItem[],
    customerId?: string
  ): Promise<PromotionalCartItem[]> {
    const baseItems = items.filter(item => !this.isPromotionalGift(item));
    const promotionalGifts = items.filter(item => this.isPromotionalGift(item));

    if (promotionalGifts.length === 0) {
      return items; // No promotional gifts to validate
    }

    // Re-evaluate promotions with current base items
    const validatedCart = await cartDomain.validateCart(baseItems);
    
    const evaluationContext: PromotionEvaluationContext = {
      cartItems: validatedCart.items.map(item => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        categoryIds: [],
      })),
      cartSubtotal: validatedCart.subtotal,
      customerId,
    };

    const promotionResult = await promotionEngine.evaluatePromotions(evaluationContext);

    // Create a set of currently eligible gift product IDs
    const eligibleGiftProductIds = new Set(
      promotionResult.freeGifts.map(gift => 
        gift.variantId ? `${gift.productId}:${gift.variantId}` : gift.productId
      )
    );

    // Filter out ineligible promotional gifts
    const validPromotionalGifts = promotionalGifts.filter(item => {
      const itemKey = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
      return eligibleGiftProductIds.has(itemKey);
    });

    return [...baseItems, ...validPromotionalGifts];
  }

  /**
   * Protect promotional gifts from manual removal
   */
  validateGiftRemoval(item: PromotionalCartItem): { canRemove: boolean; reason?: string } {
    if (!this.isPromotionalGift(item)) {
      return { canRemove: true };
    }

    return {
      canRemove: false,
      reason: 'Promotional gifts cannot be removed manually. They will be automatically removed if cart conditions change.',
    };
  }

  /**
   * Get gift item display information for labeling
   */
  getGiftDisplayInfo(item: PromotionalCartItem): {
    isGift: boolean;
    giftLabel?: string;
    promotionName?: string;
    giftValue?: number;
  } {
    if (!this.isPromotionalGift(item)) {
      return { isGift: false };
    }

    return {
      isGift: true,
      giftLabel: 'FREE GIFT',
      promotionName: item.sourcePromotionId ? `Promotion ${item.sourcePromotionId}` : undefined,
      giftValue: item.giftValue || 0,
    };
  }

  /**
   * Apply promotional discounts to existing pricing
   */
  private applyPromotionalDiscounts(
    basePricing: CartPricing,
    promotionResult: { totalDiscount: number; selectedPromotion?: AppliedPromotion }
  ): CartPricing {
    const totalDiscountAmount = basePricing.discountAmount + promotionResult.totalDiscount;
    const totalAmount = basePricing.subtotal + basePricing.shippingCost + basePricing.taxAmount - totalDiscountAmount;

    return {
      ...basePricing,
      discountAmount: totalDiscountAmount,
      totalAmount,
    };
  }

  /**
   * Check if an item is a promotional gift
   */
  private isPromotionalGift(item: CartItemInput | PromotionalCartItem): item is PromotionalCartItem {
    return 'isPromotionalGift' in item && item.isPromotionalGift === true;
  }

  /**
   * Validate cart items and ensure promotional gifts are properly managed
   */
  async validatePromotionalCart(
    items: PromotionalCartItem[],
    customerId?: string
  ): Promise<{
    isValid: boolean;
    updatedItems: PromotionalCartItem[];
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      // Remove any ineligible promotional gifts
      const validatedItems = await this.removeIneligiblePromotionalGifts(items, customerId);

      // Check if any promotional gifts were removed
      const removedGifts = items.filter(item => 
        this.isPromotionalGift(item) && 
        !validatedItems.some(validItem => 
          validItem.productId === item.productId && 
          validItem.variantId === item.variantId
        )
      );

      if (removedGifts.length > 0) {
        errors.push(`${removedGifts.length} promotional gift(s) were removed as they are no longer eligible`);
      }

      // Validate base cart items
      const baseItems = validatedItems.filter(item => !this.isPromotionalGift(item));
      const validatedCart = await cartDomain.validateCart(baseItems);

      if (!validatedCart.isValid) {
        errors.push(...validatedCart.errors.map(error => error.message));
      }

      return {
        isValid: validatedCart.isValid,
        updatedItems: validatedItems,
        errors,
      };
    } catch (error) {
      return {
        isValid: false,
        updatedItems: items,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
      };
    }
  }

  /**
   * Get promotional gift summary for display
   */
  getPromotionalGiftSummary(items: PromotionalCartItem[]): {
    totalGifts: number;
    totalGiftValue: number;
    giftsByPromotion: Map<string, { count: number; value: number; items: PromotionalCartItem[] }>;
  } {
    const promotionalGifts = items.filter(item => this.isPromotionalGift(item));
    const giftsByPromotion = new Map<string, { count: number; value: number; items: PromotionalCartItem[] }>();

    let totalGiftValue = 0;

    for (const gift of promotionalGifts) {
      const promotionId = gift.sourcePromotionId || 'unknown';
      const giftValue = gift.giftValue || 0;
      
      totalGiftValue += giftValue;

      if (!giftsByPromotion.has(promotionId)) {
        giftsByPromotion.set(promotionId, { count: 0, value: 0, items: [] });
      }

      const promotionSummary = giftsByPromotion.get(promotionId)!;
      promotionSummary.count += gift.quantity;
      promotionSummary.value += giftValue;
      promotionSummary.items.push(gift);
    }

    return {
      totalGifts: promotionalGifts.length,
      totalGiftValue,
      giftsByPromotion,
    };
  }
}

export const promotionalCartService = new PromotionalCartService();