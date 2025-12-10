import { promotionRepository } from './promotions.repository';
import { 
  ValidationError, 
  NotFoundError 
} from '../../core/errors';
import type {
  Promotion,
  PromotionRule,
  PromotionEvaluationContext,
  PromotionEvaluationResult,
  AppliedPromotion,
  EligiblePromotion,
  FreeGift,
  ConflictResolution,
  CartItem
} from './promotions.interface';
import {
  PromotionValidationError,
  PromotionUsageLimitError,
  PromotionExpiredError
} from './promotions.interface';

export class PromotionEngine {
  /**
   * Evaluate all active promotions for a cart and return the best applicable promotion
   */
  async evaluatePromotions(context: PromotionEvaluationContext): Promise<PromotionEvaluationResult> {
    // Validate evaluation context
    this.validateEvaluationContext(context);

    // Get all active promotions
    const activePromotions = await promotionRepository.getActivePromotions();
    
    if (activePromotions.length === 0) {
      return {
        eligiblePromotions: [],
        totalDiscount: 0,
        freeGifts: [],
      };
    }

    // Evaluate each promotion for eligibility
    const eligiblePromotions: EligiblePromotion[] = [];
    
    for (const promotion of activePromotions) {
      const eligibility = await this.evaluatePromotionEligibility(promotion, context);
      if (eligibility) {
        eligiblePromotions.push(eligibility);
      }
    }

    if (eligiblePromotions.length === 0) {
      return {
        eligiblePromotions: [],
        totalDiscount: 0,
        freeGifts: [],
      };
    }

    // Resolve conflicts and select the best promotion
    const { selectedPromotion, conflictResolution } = await this.selectOptimalPromotion(
      eligiblePromotions,
      context
    );

    return {
      eligiblePromotions,
      selectedPromotion,
      totalDiscount: selectedPromotion?.discountAmount || 0,
      freeGifts: selectedPromotion?.freeGifts || [],
      conflictResolution,
    };
  }

  /**
   * Evaluate if a single promotion is eligible for the given context
   */
  async evaluatePromotionEligibility(
    promotion: Promotion,
    context: PromotionEvaluationContext
  ): Promise<EligiblePromotion | null> {
    // Check if promotion is active and within time bounds
    if (!this.isPromotionActive(promotion)) {
      return null;
    }

    // Check usage limits if customer is specified
    if (context.customerId) {
      try {
        await this.validateUsageLimits(promotion, context.customerId);
      } catch (error) {
        // Usage limit exceeded, promotion not eligible
        return null;
      }
    }

    // Get promotion rules
    const rules = await promotionRepository.getPromotionRules(promotion.id);
    const conditionRules = rules.filter(r => r.ruleType === 'condition');
    const benefitRules = rules.filter(r => r.ruleType === 'benefit');

    // Check all conditions must be met
    for (const condition of conditionRules) {
      if (!this.evaluateCondition(condition, context)) {
        return null; // Promotion not eligible
      }
    }

    // Calculate potential benefits
    const { potentialDiscount, potentialGifts } = await this.calculatePotentialBenefits(
      benefitRules,
      context
    );

    return {
      promotion,
      rules,
      potentialDiscount,
      potentialGifts,
      priority: promotion.priority,
    };
  }

  /**
   * Check if a promotion is currently active
   */
  private isPromotionActive(promotion: Promotion): boolean {
    const now = new Date();
    return (
      promotion.status === 'active' &&
      promotion.startsAt <= now &&
      promotion.endsAt > now
    );
  }

  /**
   * Validate usage limits for a promotion and customer
   */
  private async validateUsageLimits(promotion: Promotion, customerId: string): Promise<void> {
    // Check total usage limit
    if (promotion.usageLimit && promotion.currentUsageCount >= promotion.usageLimit) {
      throw new PromotionUsageLimitError('Promotion usage limit exceeded', promotion.id);
    }

    // Check per-customer usage limit
    if (promotion.usageLimitPerCustomer) {
      const customerUsage = await promotionRepository.getCustomerPromotionUsageCount(
        promotion.id,
        customerId
      );
      
      if (customerUsage >= promotion.usageLimitPerCustomer) {
        throw new PromotionUsageLimitError(
          'Customer usage limit exceeded for this promotion',
          promotion.id
        );
      }
    }
  }

  /**
   * Evaluate a single condition rule against the cart context
   */
  private evaluateCondition(condition: PromotionRule, context: PromotionEvaluationContext): boolean {
    switch (condition.conditionType) {
      case 'cart_value':
        return this.evaluateCartValueCondition(condition, context.cartSubtotal);
      
      case 'product_quantity':
        return this.evaluateProductQuantityCondition(condition, context.cartItems);
      
      case 'specific_products':
        return this.evaluateSpecificProductsCondition(condition, context.cartItems);
      
      case 'category_products':
        return this.evaluateCategoryProductsCondition(condition, context.cartItems);
      
      default:
        return false;
    }
  }

  /**
   * Evaluate cart value condition (e.g., cart total >= $100)
   */
  private evaluateCartValueCondition(condition: PromotionRule, cartSubtotal: number): boolean {
    const threshold = condition.numericValue || 0;
    
    switch (condition.operator) {
      case 'gte':
        return cartSubtotal >= threshold;
      case 'lte':
        return cartSubtotal <= threshold;
      case 'eq':
        return cartSubtotal === threshold;
      default:
        return false;
    }
  }

  /**
   * Evaluate product quantity condition (e.g., total quantity >= 3)
   */
  private evaluateProductQuantityCondition(condition: PromotionRule, cartItems: CartItem[]): boolean {
    const targetProductIds = condition.jsonValue as string[] || [];
    const threshold = condition.numericValue || 0;
    
    let totalQuantity = 0;
    for (const item of cartItems) {
      if (targetProductIds.length === 0 || targetProductIds.includes(item.productId)) {
        totalQuantity += item.quantity;
      }
    }
    
    switch (condition.operator) {
      case 'gte':
        return totalQuantity >= threshold;
      case 'lte':
        return totalQuantity <= threshold;
      case 'eq':
        return totalQuantity === threshold;
      default:
        return false;
    }
  }

  /**
   * Evaluate specific products condition (e.g., cart contains product A or B)
   */
  private evaluateSpecificProductsCondition(condition: PromotionRule, cartItems: CartItem[]): boolean {
    const requiredProductIds = condition.jsonValue as string[] || [];
    const cartProductIds = cartItems.map(item => item.productId);
    
    switch (condition.operator) {
      case 'in':
        return requiredProductIds.some(id => cartProductIds.includes(id));
      case 'not_in':
        return !requiredProductIds.some(id => cartProductIds.includes(id));
      default:
        return false;
    }
  }

  /**
   * Evaluate category products condition (e.g., cart contains products from category X)
   */
  private evaluateCategoryProductsCondition(condition: PromotionRule, cartItems: CartItem[]): boolean {
    const requiredCategoryIds = condition.jsonValue as string[] || [];
    
    for (const item of cartItems) {
      const itemCategoryIds = item.categoryIds || [];
      
      switch (condition.operator) {
        case 'in':
          if (requiredCategoryIds.some(id => itemCategoryIds.includes(id))) {
            return true;
          }
          break;
        case 'not_in':
          if (requiredCategoryIds.some(id => itemCategoryIds.includes(id))) {
            return false;
          }
          break;
      }
    }
    
    return condition.operator === 'not_in'; // If we reach here with not_in, no matches found
  }

  /**
   * Calculate potential benefits from benefit rules
   */
  private async calculatePotentialBenefits(
    benefitRules: PromotionRule[],
    context: PromotionEvaluationContext
  ): Promise<{ potentialDiscount: number; potentialGifts: FreeGift[] }> {
    let potentialDiscount = 0;
    const potentialGifts: FreeGift[] = [];

    for (const benefit of benefitRules) {
      switch (benefit.benefitType) {
        case 'percentage_discount':
          potentialDiscount += this.calculatePercentageDiscount(benefit, context);
          break;
        
        case 'fixed_discount':
          potentialDiscount += this.calculateFixedDiscount(benefit, context);
          break;
        
        case 'free_gift':
          const gifts = await this.calculateFreeGifts(benefit);
          potentialGifts.push(...gifts);
          break;
      }
    }

    return { potentialDiscount, potentialGifts };
  }

  /**
   * Calculate percentage discount amount with proper capping
   */
  private calculatePercentageDiscount(benefit: PromotionRule, context: PromotionEvaluationContext): number {
    const percentage = benefit.benefitValue || 0;
    let applicableSubtotal = context.cartSubtotal;

    // Apply to specific products if specified
    if (benefit.applicableProductIds && benefit.applicableProductIds.length > 0) {
      applicableSubtotal = context.cartItems
        .filter(item => benefit.applicableProductIds!.includes(item.productId))
        .reduce((sum, item) => sum + item.subtotal, 0);
    }

    let discount = Math.round((applicableSubtotal * percentage) / 100);

    // Apply maximum discount cap if specified
    if (benefit.maxDiscountAmount && discount > benefit.maxDiscountAmount) {
      discount = benefit.maxDiscountAmount;
    }

    return discount;
  }

  /**
   * Calculate fixed discount amount with cart value capping
   */
  private calculateFixedDiscount(benefit: PromotionRule, context: PromotionEvaluationContext): number {
    const fixedAmount = benefit.benefitValue || 0;
    let applicableSubtotal = context.cartSubtotal;

    // Apply to specific products if specified
    if (benefit.applicableProductIds && benefit.applicableProductIds.length > 0) {
      applicableSubtotal = context.cartItems
        .filter(item => benefit.applicableProductIds!.includes(item.productId))
        .reduce((sum, item) => sum + item.subtotal, 0);
    }

    // Don't exceed the applicable subtotal (prevent negative totals)
    return Math.min(fixedAmount, applicableSubtotal);
  }

  /**
   * Calculate free gifts with inventory validation
   */
  private async calculateFreeGifts(benefit: PromotionRule): Promise<FreeGift[]> {
    const giftProductIds = benefit.giftProductIds || [];
    const giftQuantities = benefit.giftQuantities || [];

    if (giftProductIds.length === 0) return [];

    // Validate gift products are available in inventory
    const validatedGifts = await promotionRepository.validateGiftProducts(giftProductIds);
    
    const freeGifts: FreeGift[] = [];
    for (let i = 0; i < giftProductIds.length; i++) {
      const productId = giftProductIds[i];
      const quantity = giftQuantities[i] || 1;
      const validatedGift = validatedGifts.find(g => g.id === productId);

      if (validatedGift && validatedGift.inStock) {
        freeGifts.push({
          productId,
          quantity,
          name: validatedGift.name,
          value: 0, // Free gifts have no monetary value
        });
      }
    }

    return freeGifts;
  }

  /**
   * Select the optimal promotion from eligible promotions using priority and customer benefit
   */
  private async selectOptimalPromotion(
    eligiblePromotions: EligiblePromotion[],
    context: PromotionEvaluationContext
  ): Promise<{ selectedPromotion?: AppliedPromotion; conflictResolution?: ConflictResolution }> {
    if (eligiblePromotions.length === 1) {
      const promotion = eligiblePromotions[0];
      return {
        selectedPromotion: {
          promotionId: promotion.promotion.id,
          promotionName: promotion.promotion.name,
          discountAmount: promotion.potentialDiscount,
          freeGifts: promotion.potentialGifts,
          appliedAt: new Date(),
        },
      };
    }

    // Check for exclusivity conflicts
    const conflictingPromotions = await this.findExclusivityConflicts(eligiblePromotions);

    // Sort by priority first, then by customer benefit
    const sortedPromotions = [...eligiblePromotions].sort((a, b) => {
      // Higher priority first
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      
      // Higher customer benefit first (discount + gift value)
      const benefitA = a.potentialDiscount + a.potentialGifts.reduce((sum, gift) => sum + gift.value, 0);
      const benefitB = b.potentialDiscount + b.potentialGifts.reduce((sum, gift) => sum + gift.value, 0);
      return benefitB - benefitA;
    });

    const selectedPromotion = sortedPromotions[0];
    const rejectedPromotions = sortedPromotions.slice(1);

    return {
      selectedPromotion: {
        promotionId: selectedPromotion.promotion.id,
        promotionName: selectedPromotion.promotion.name,
        discountAmount: selectedPromotion.potentialDiscount,
        freeGifts: selectedPromotion.potentialGifts,
        appliedAt: new Date(),
      },
      conflictResolution: {
        conflictType: conflictingPromotions.length > 0 ? 'exclusivity' : 'customer_benefit',
        selectedPromotionId: selectedPromotion.promotion.id,
        rejectedPromotionIds: rejectedPromotions.map(p => p.promotion.id),
        reason: conflictingPromotions.length > 0 
          ? 'Promotion has exclusivity rules that conflict with other eligible promotions'
          : 'Selected promotion with highest priority and customer benefit',
      },
    };
  }

  /**
   * Find exclusivity conflicts between eligible promotions
   */
  private async findExclusivityConflicts(eligiblePromotions: EligiblePromotion[]): Promise<string[]> {
    const conflictingPromotions: string[] = [];
    
    for (let i = 0; i < eligiblePromotions.length; i++) {
      for (let j = i + 1; j < eligiblePromotions.length; j++) {
        const conflicts = await promotionRepository.checkPromotionConflicts(
          eligiblePromotions[i].promotion.id,
          [eligiblePromotions[j].promotion.id]
        );
        if (conflicts.length > 0) {
          conflictingPromotions.push(...conflicts);
        }
      }
    }

    return [...new Set(conflictingPromotions)]; // Remove duplicates
  }

  /**
   * Validate the evaluation context has required fields
   */
  private validateEvaluationContext(context: PromotionEvaluationContext): void {
    if (!context.cartItems || !Array.isArray(context.cartItems)) {
      throw new ValidationError('Cart items are required for promotion evaluation');
    }

    if (typeof context.cartSubtotal !== 'number' || context.cartSubtotal < 0) {
      throw new ValidationError('Valid cart subtotal is required for promotion evaluation');
    }

    // Validate cart items structure
    for (const item of context.cartItems) {
      if (!item.productId || typeof item.productId !== 'string') {
        throw new ValidationError('Each cart item must have a valid product ID');
      }

      if (typeof item.quantity !== 'number' || item.quantity <= 0) {
        throw new ValidationError('Each cart item must have a positive quantity');
      }

      if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
        throw new ValidationError('Each cart item must have a valid unit price');
      }

      if (typeof item.subtotal !== 'number' || item.subtotal < 0) {
        throw new ValidationError('Each cart item must have a valid subtotal');
      }
    }
  }

  /**
   * Apply discount capping to prevent over-discounting
   */
  private applyDiscountCapping(
    discountAmount: number,
    maxDiscountAmount?: number,
    applicableSubtotal?: number
  ): number {
    let cappedDiscount = discountAmount;

    // Apply maximum discount cap if specified
    if (maxDiscountAmount && cappedDiscount > maxDiscountAmount) {
      cappedDiscount = maxDiscountAmount;
    }

    // Don't exceed the applicable subtotal
    if (applicableSubtotal && cappedDiscount > applicableSubtotal) {
      cappedDiscount = applicableSubtotal;
    }

    return cappedDiscount;
  }

  /**
   * Validate server-side calculations to prevent manipulation
   */
  private validateCalculations(
    originalContext: PromotionEvaluationContext,
    calculatedDiscount: number,
    calculatedGifts: FreeGift[]
  ): boolean {
    // Recalculate cart subtotal from items to verify
    const recalculatedSubtotal = originalContext.cartItems.reduce(
      (sum, item) => sum + (item.unitPrice * item.quantity),
      0
    );

    // Allow small rounding differences (within 1 cent)
    const subtotalDifference = Math.abs(recalculatedSubtotal - originalContext.cartSubtotal);
    if (subtotalDifference > 1) {
      throw new ValidationError('Cart subtotal validation failed - possible manipulation detected');
    }

    // Validate discount doesn't exceed cart subtotal
    if (calculatedDiscount > originalContext.cartSubtotal) {
      throw new ValidationError('Discount amount exceeds cart subtotal - invalid calculation');
    }

    // Validate gift quantities are reasonable
    const totalGiftQuantity = calculatedGifts.reduce((sum, gift) => sum + gift.quantity, 0);
    if (totalGiftQuantity > 10) { // Arbitrary reasonable limit
      throw new ValidationError('Excessive gift quantity detected - possible manipulation');
    }

    return true;
  }
}

export const promotionEngine = new PromotionEngine();