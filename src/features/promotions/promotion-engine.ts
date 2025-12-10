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

    // Perform additional validation for high-value promotions
    this.validateHighValuePromotion(promotion, potentialDiscount, context);

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
          const gifts = await this.calculateFreeGifts(benefit, context);
          potentialGifts.push(...gifts);
          break;
      }
    }

    return { potentialDiscount, potentialGifts };
  }

  /**
   * Calculate percentage discount amount with proper capping and validation
   */
  private calculatePercentageDiscount(benefit: PromotionRule, context: PromotionEvaluationContext): number {
    const percentage = benefit.benefitValue || 0;
    
    // Validate percentage is within reasonable bounds
    if (percentage < 0 || percentage > 100) {
      throw new ValidationError(`Invalid percentage value: ${percentage}. Must be between 0 and 100.`);
    }

    let applicableSubtotal = this.calculateApplicableSubtotal(benefit, context);

    // Calculate raw discount amount
    let discount = Math.round((applicableSubtotal * percentage) / 100);

    // Apply comprehensive discount capping
    discount = this.applyDiscountCapping(discount, benefit.maxDiscountAmount, applicableSubtotal);

    // Server-side validation to prevent manipulation
    this.validateDiscountCalculation(discount, applicableSubtotal, percentage, 'percentage');

    return discount;
  }

  /**
   * Calculate fixed discount amount with cart value capping and validation
   */
  private calculateFixedDiscount(benefit: PromotionRule, context: PromotionEvaluationContext): number {
    const fixedAmount = benefit.benefitValue || 0;
    
    // Validate fixed amount is positive
    if (fixedAmount < 0) {
      throw new ValidationError(`Invalid fixed discount amount: ${fixedAmount}. Must be non-negative.`);
    }

    let applicableSubtotal = this.calculateApplicableSubtotal(benefit, context);

    // Apply cart value capping - don't exceed the applicable subtotal
    let discount = Math.min(fixedAmount, applicableSubtotal);

    // Apply additional discount capping if specified
    discount = this.applyDiscountCapping(discount, benefit.maxDiscountAmount, applicableSubtotal);

    // Server-side validation to prevent manipulation
    this.validateDiscountCalculation(discount, applicableSubtotal, fixedAmount, 'fixed');

    return discount;
  }

  /**
   * Calculate applicable subtotal based on product restrictions
   */
  private calculateApplicableSubtotal(benefit: PromotionRule, context: PromotionEvaluationContext): number {
    // Apply to specific products if specified
    if (benefit.applicableProductIds && benefit.applicableProductIds.length > 0) {
      return context.cartItems
        .filter(item => benefit.applicableProductIds!.includes(item.productId))
        .reduce((sum, item) => sum + item.subtotal, 0);
    }

    // Apply to all products
    return context.cartSubtotal;
  }

  /**
   * Calculate free gifts with comprehensive inventory validation and tier selection
   */
  private async calculateFreeGifts(benefit: PromotionRule, context?: PromotionEvaluationContext): Promise<FreeGift[]> {
    const giftProductIds = benefit.giftProductIds || [];
    const giftQuantities = benefit.giftQuantities || [];

    if (giftProductIds.length === 0) return [];

    // Validate gift products are available in inventory before promotion application
    const validatedGifts = await this.validateGiftInventoryAvailability(giftProductIds);
    
    const freeGifts: FreeGift[] = [];
    for (let i = 0; i < giftProductIds.length; i++) {
      const productId = giftProductIds[i];
      const quantity = giftQuantities[i] || 1;
      const validatedGift = validatedGifts.find(g => g.id === productId);

      if (validatedGift && validatedGift.inStock && validatedGift.availableQuantity >= quantity) {
        freeGifts.push({
          productId,
          quantity,
          name: validatedGift.name,
          value: 0, // Free gifts have no monetary value
          imageUrl: validatedGift.imageUrl,
        });
      }
    }

    return freeGifts;
  }

  /**
   * Validate gift inventory availability with detailed stock checking
   */
  private async validateGiftInventoryAvailability(productIds: string[]): Promise<Array<{
    id: string;
    name: string;
    inStock: boolean;
    availableQuantity: number;
    imageUrl?: string;
  }>> {
    if (productIds.length === 0) return [];

    // Get detailed product information including stock levels
    const giftProducts = await promotionRepository.validateGiftProductsWithStock(productIds);
    
    return giftProducts.map(product => ({
      id: product.id,
      name: product.name,
      inStock: product.status === 'active' && (product.availableQuantity || 0) > 0,
      availableQuantity: product.availableQuantity || 0,
      imageUrl: product.imageUrl,
    }));
  }

  /**
   * Evaluate gift promotion eligibility with tier selection logic
   */
  async evaluateGiftPromotionEligibility(
    promotion: Promotion,
    context: PromotionEvaluationContext
  ): Promise<{ eligible: boolean; selectedTier?: PromotionRule; freeGifts: FreeGift[] }> {
    // Get all gift benefit rules for this promotion
    const rules = await promotionRepository.getPromotionRules(promotion.id);
    const giftBenefitRules = rules.filter(r => r.ruleType === 'benefit' && r.benefitType === 'free_gift');
    
    if (giftBenefitRules.length === 0) {
      return { eligible: false, freeGifts: [] };
    }

    // Check if basic promotion conditions are met
    const conditionRules = rules.filter(r => r.ruleType === 'condition');
    for (const condition of conditionRules) {
      if (!this.evaluateCondition(condition, context)) {
        return { eligible: false, freeGifts: [] };
      }
    }

    // For multi-tier promotions, select the highest qualifying tier
    const qualifyingTiers = await this.selectHighestQualifyingGiftTier(giftBenefitRules, context);
    
    if (!qualifyingTiers.selectedTier) {
      return { eligible: false, freeGifts: [] };
    }

    // Calculate gifts for the selected tier with inventory validation
    const freeGifts = await this.calculateFreeGifts(qualifyingTiers.selectedTier, context);
    
    // If no gifts are available due to inventory, promotion is not eligible
    if (freeGifts.length === 0) {
      return { eligible: false, freeGifts: [] };
    }

    return {
      eligible: true,
      selectedTier: qualifyingTiers.selectedTier,
      freeGifts,
    };
  }

  /**
   * Select highest qualifying gift tier for multi-tier promotions
   */
  private async selectHighestQualifyingGiftTier(
    giftBenefitRules: PromotionRule[],
    context: PromotionEvaluationContext
  ): Promise<{ selectedTier?: PromotionRule; qualifyingTiers: PromotionRule[] }> {
    const qualifyingTiers: PromotionRule[] = [];

    // Evaluate each tier to see if it qualifies
    for (const tier of giftBenefitRules) {
      if (await this.evaluateGiftTierConditions(tier, context)) {
        qualifyingTiers.push(tier);
      }
    }

    if (qualifyingTiers.length === 0) {
      return { qualifyingTiers: [] };
    }

    // Sort tiers by their threshold value (highest first) to award highest qualifying tier
    const sortedTiers = qualifyingTiers.sort((a, b) => {
      const thresholdA = a.numericValue || 0;
      const thresholdB = b.numericValue || 0;
      return thresholdB - thresholdA;
    });

    return {
      selectedTier: sortedTiers[0], // Highest qualifying tier
      qualifyingTiers,
    };
  }

  /**
   * Evaluate conditions specific to a gift tier
   */
  private async evaluateGiftTierConditions(tier: PromotionRule, context: PromotionEvaluationContext): Promise<boolean> {
    // For gift tiers, the threshold is typically stored in numericValue
    // This represents the minimum cart value for this tier
    const threshold = tier.numericValue || 0;
    
    // Check if cart meets the threshold for this tier
    if (context.cartSubtotal < threshold) {
      return false;
    }

    // Additional tier-specific conditions can be added here
    // For example, checking if specific products are in cart for this tier
    if (tier.applicableProductIds && tier.applicableProductIds.length > 0) {
      const cartProductIds = context.cartItems.map(item => item.productId);
      const hasRequiredProducts = tier.applicableProductIds.some(id => cartProductIds.includes(id));
      if (!hasRequiredProducts) {
        return false;
      }
    }

    return true;
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

    // Apply promotion selection algorithm
    const selectionResult = await this.applyPromotionSelectionAlgorithm(eligiblePromotions);
    
    return selectionResult;
  }

  /**
   * Apply sophisticated promotion selection algorithm with conflict resolution
   */
  private async applyPromotionSelectionAlgorithm(
    eligiblePromotions: EligiblePromotion[]
  ): Promise<{ selectedPromotion?: AppliedPromotion; conflictResolution?: ConflictResolution }> {
    // Step 1: Check for exclusivity conflicts
    const conflictingPromotions = await this.findExclusivityConflicts(eligiblePromotions);
    
    // Step 2: Filter out conflicting promotions if any exist
    let candidatePromotions = eligiblePromotions;
    if (conflictingPromotions.length > 0) {
      candidatePromotions = await this.resolveExclusivityConflicts(eligiblePromotions, conflictingPromotions);
    }

    // Step 3: Apply priority-based ordering
    const priorityOrderedPromotions = this.orderPromotionsByPriority(candidatePromotions);

    // Step 4: Apply customer benefit optimization within same priority levels
    const optimizedSelection = this.optimizeCustomerBenefit(priorityOrderedPromotions);

    const selectedPromotion = optimizedSelection[0];
    const rejectedPromotions = optimizedSelection.slice(1);

    return {
      selectedPromotion: {
        promotionId: selectedPromotion.promotion.id,
        promotionName: selectedPromotion.promotion.name,
        discountAmount: selectedPromotion.potentialDiscount,
        freeGifts: selectedPromotion.potentialGifts,
        appliedAt: new Date(),
      },
      conflictResolution: {
        conflictType: conflictingPromotions.length > 0 ? 'exclusivity' : 
                     priorityOrderedPromotions[0]?.priority !== priorityOrderedPromotions[1]?.priority ? 'priority' : 'customer_benefit',
        selectedPromotionId: selectedPromotion.promotion.id,
        rejectedPromotionIds: rejectedPromotions.map(p => p.promotion.id),
        reason: this.generateConflictResolutionReason(conflictingPromotions.length > 0, selectedPromotion, rejectedPromotions),
      },
    };
  }

  /**
   * Resolve exclusivity conflicts by selecting the highest priority promotion from conflicting groups
   */
  private async resolveExclusivityConflicts(
    eligiblePromotions: EligiblePromotion[],
    conflictingPromotionIds: string[]
  ): Promise<EligiblePromotion[]> {
    const nonConflictingPromotions = eligiblePromotions.filter(
      p => !conflictingPromotionIds.includes(p.promotion.id)
    );
    
    const conflictingPromotions = eligiblePromotions.filter(
      p => conflictingPromotionIds.includes(p.promotion.id)
    );

    if (conflictingPromotions.length === 0) {
      return eligiblePromotions;
    }

    // Select the highest priority promotion from conflicting ones
    const selectedConflictingPromotion = conflictingPromotions.reduce((best, current) => {
      if (current.priority > best.priority) return current;
      if (current.priority === best.priority) {
        // Same priority, choose by customer benefit
        const currentBenefit = current.potentialDiscount + current.potentialGifts.reduce((sum, gift) => sum + gift.value, 0);
        const bestBenefit = best.potentialDiscount + best.potentialGifts.reduce((sum, gift) => sum + gift.value, 0);
        return currentBenefit > bestBenefit ? current : best;
      }
      return best;
    });

    return [...nonConflictingPromotions, selectedConflictingPromotion];
  }

  /**
   * Order promotions by priority (highest first)
   */
  private orderPromotionsByPriority(promotions: EligiblePromotion[]): EligiblePromotion[] {
    return [...promotions].sort((a, b) => b.priority - a.priority);
  }

  /**
   * Optimize customer benefit within same priority levels
   */
  private optimizeCustomerBenefit(promotions: EligiblePromotion[]): EligiblePromotion[] {
    return [...promotions].sort((a, b) => {
      // First sort by priority (highest first)
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      
      // Within same priority, sort by customer benefit (highest first)
      const benefitA = this.calculateTotalCustomerBenefit(a);
      const benefitB = this.calculateTotalCustomerBenefit(b);
      
      if (benefitA !== benefitB) {
        return benefitB - benefitA;
      }

      // If benefits are equal, prefer the promotion created earlier (more stable)
      return a.promotion.createdAt.getTime() - b.promotion.createdAt.getTime();
    });
  }

  /**
   * Calculate total customer benefit including discounts and gift values
   */
  private calculateTotalCustomerBenefit(promotion: EligiblePromotion): number {
    const discountBenefit = promotion.potentialDiscount;
    const giftBenefit = promotion.potentialGifts.reduce((sum, gift) => sum + gift.value, 0);
    return discountBenefit + giftBenefit;
  }

  /**
   * Generate human-readable conflict resolution reason
   */
  private generateConflictResolutionReason(
    hasExclusivityConflict: boolean,
    selectedPromotion: EligiblePromotion,
    rejectedPromotions: EligiblePromotion[]
  ): string {
    if (hasExclusivityConflict) {
      return `Selected promotion "${selectedPromotion.promotion.name}" due to exclusivity rules preventing combination with other promotions`;
    }

    if (rejectedPromotions.length > 0 && selectedPromotion.priority > rejectedPromotions[0].priority) {
      return `Selected promotion "${selectedPromotion.promotion.name}" due to higher priority (${selectedPromotion.priority})`;
    }

    const selectedBenefit = this.calculateTotalCustomerBenefit(selectedPromotion);
    return `Selected promotion "${selectedPromotion.promotion.name}" for optimal customer benefit (${selectedBenefit} cents total value)`;
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
   * Apply comprehensive discount capping to prevent over-discounting
   */
  private applyDiscountCapping(
    discountAmount: number,
    maxDiscountAmount?: number,
    applicableSubtotal?: number
  ): number {
    let cappedDiscount = discountAmount;

    // Ensure discount is non-negative
    if (cappedDiscount < 0) {
      cappedDiscount = 0;
    }

    // Apply maximum discount cap if specified (for percentage discounts)
    if (maxDiscountAmount && maxDiscountAmount > 0 && cappedDiscount > maxDiscountAmount) {
      cappedDiscount = maxDiscountAmount;
    }

    // Don't exceed the applicable subtotal (prevent negative cart totals)
    if (applicableSubtotal && cappedDiscount > applicableSubtotal) {
      cappedDiscount = applicableSubtotal;
    }

    // Apply reasonable upper bound to prevent abuse (e.g., max 50,000 THB discount)
    const maxReasonableDiscount = 5000000; // 50,000 THB in cents
    if (cappedDiscount > maxReasonableDiscount) {
      cappedDiscount = maxReasonableDiscount;
    }

    return Math.round(cappedDiscount); // Ensure integer cents
  }

  /**
   * Validate discount calculations to prevent manipulation and ensure accuracy
   */
  private validateDiscountCalculation(
    calculatedDiscount: number,
    applicableSubtotal: number,
    benefitValue: number,
    discountType: 'percentage' | 'fixed'
  ): void {
    // Validate discount doesn't exceed applicable subtotal
    if (calculatedDiscount > applicableSubtotal) {
      throw new ValidationError(
        `Discount amount (${calculatedDiscount}) exceeds applicable subtotal (${applicableSubtotal})`
      );
    }

    // Validate discount is non-negative
    if (calculatedDiscount < 0) {
      throw new ValidationError(`Discount amount cannot be negative: ${calculatedDiscount}`);
    }

    // Type-specific validations
    if (discountType === 'percentage') {
      // For percentage discounts, recalculate to verify accuracy
      const expectedDiscount = Math.round((applicableSubtotal * benefitValue) / 100);
      const tolerance = Math.max(1, Math.round(expectedDiscount * 0.01)); // 1% tolerance or 1 cent minimum
      
      if (Math.abs(calculatedDiscount - expectedDiscount) > tolerance) {
        throw new ValidationError(
          `Percentage discount calculation mismatch. Expected: ${expectedDiscount}, Got: ${calculatedDiscount}`
        );
      }
    } else if (discountType === 'fixed') {
      // For fixed discounts, ensure it doesn't exceed the fixed amount
      if (calculatedDiscount > benefitValue) {
        throw new ValidationError(
          `Fixed discount (${calculatedDiscount}) exceeds specified amount (${benefitValue})`
        );
      }
    }

    // Validate reasonable bounds
    if (calculatedDiscount > 5000000) { // 50,000 THB
      throw new ValidationError(`Discount amount exceeds reasonable bounds: ${calculatedDiscount}`);
    }
  }

  /**
   * Perform additional security validation for high-value promotions
   */
  private validateHighValuePromotion(
    promotion: Promotion,
    calculatedDiscount: number,
    context: PromotionEvaluationContext
  ): void {
    const highValueThreshold = 500000; // 5,000 THB in cents

    if (calculatedDiscount > highValueThreshold) {
      // Log high-value promotion application for audit
      console.warn(`High-value promotion applied: ${promotion.id}, discount: ${calculatedDiscount}, customer: ${context.customerId}`);

      // Additional validation for high-value promotions
      if (calculatedDiscount > context.cartSubtotal * 0.8) { // More than 80% discount
        throw new ValidationError(
          `High-value promotion discount (${calculatedDiscount}) exceeds 80% of cart value (${context.cartSubtotal})`
        );
      }

      // Check if promotion has reasonable usage limits for high-value discounts
      if (!promotion.usageLimit || promotion.usageLimit > 1000) {
        throw new ValidationError(
          `High-value promotion must have reasonable usage limits (current: ${promotion.usageLimit})`
        );
      }
    }
  }

  /**
   * Validate and enforce usage limits before order completion
   * This is called during order creation to ensure limits are still valid
   */
  async validateAndEnforceUsageLimits(
    appliedPromotions: AppliedPromotion[],
    customerId?: string
  ): Promise<void> {
    for (const appliedPromotion of appliedPromotions) {
      const promotion = await promotionRepository.getPromotionById(appliedPromotion.promotionId);
      
      if (!promotion) {
        throw new NotFoundError(`Promotion ${appliedPromotion.promotionId} not found`);
      }

      // Re-validate usage limits at order creation time
      if (customerId) {
        await this.validateUsageLimits(promotion, customerId);
      }

      // Check if promotion is still active
      if (!this.isPromotionActive(promotion)) {
        throw new PromotionExpiredError(
          `Promotion ${promotion.name} is no longer active`,
          promotion.id
        );
      }
    }
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