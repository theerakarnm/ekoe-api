import { promotionRepository } from './promotions.repository';
import { 
  ValidationError, 
  NotFoundError, 
  ConflictError 
} from '../../core/errors';
import type {
  Promotion,
  PromotionRule,
  CreatePromotionDto,
  UpdatePromotionDto,
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
  PromotionConflictError,
  PromotionUsageLimitError,
  PromotionExpiredError
} from './promotions.interface';

export class PromotionDomain {
  /**
   * Create a new promotion with validation
   */
  async createPromotion(data: CreatePromotionDto, createdBy?: string): Promise<Promotion> {
    // Validate promotion data
    await this.validatePromotionData(data);

    // Create the promotion
    const promotion = await promotionRepository.createPromotion(data, createdBy);

    // Set initial status based on dates
    const status = this.determinePromotionStatus(promotion.startsAt, promotion.endsAt);
    if (status !== 'draft') {
      await promotionRepository.updatePromotionStatus(promotion.id, status);
      promotion.status = status as any;
    }

    return promotion;
  }

  /**
   * Update an existing promotion with validation
   */
  async updatePromotion(id: string, data: Partial<UpdatePromotionDto>): Promise<Promotion> {
    const existingPromotion = await promotionRepository.getPromotionById(id);
    if (!existingPromotion) {
      throw new NotFoundError('Promotion not found');
    }

    // Validate that active promotions can only have limited changes
    if (existingPromotion.status === 'active') {
      this.validateActivePromotionUpdate(data);
    }

    // Validate updated data
    if (data.startsAt || data.endsAt) {
      const startDate = data.startsAt ? new Date(data.startsAt) : existingPromotion.startsAt;
      const endDate = data.endsAt ? new Date(data.endsAt) : existingPromotion.endsAt;
      
      if (endDate <= startDate) {
        throw new PromotionValidationError('End date must be after start date', 'endsAt');
      }
    }

    const updatedPromotion = await promotionRepository.updatePromotion(id, data);
    if (!updatedPromotion) {
      throw new NotFoundError('Promotion not found');
    }

    // Update status if dates changed
    if (data.startsAt || data.endsAt) {
      const newStatus = this.determinePromotionStatus(updatedPromotion.startsAt, updatedPromotion.endsAt);
      if (newStatus !== updatedPromotion.status) {
        await promotionRepository.updatePromotionStatus(id, newStatus);
        updatedPromotion.status = newStatus as any;
      }
    }

    return updatedPromotion;
  }

  /**
   * Add rules to a promotion
   */
  async addPromotionRules(promotionId: string, rules: Omit<PromotionRule, 'id' | 'promotionId' | 'createdAt'>[]): Promise<PromotionRule[]> {
    const promotion = await promotionRepository.getPromotionById(promotionId);
    if (!promotion) {
      throw new NotFoundError('Promotion not found');
    }

    // Validate rules
    this.validatePromotionRules(rules);

    // Create rules
    const createdRules: PromotionRule[] = [];
    for (const rule of rules) {
      const createdRule = await promotionRepository.createPromotionRule({
        ...rule,
        promotionId,
      });
      createdRules.push(createdRule);
    }

    return createdRules;
  }

  /**
   * Evaluate promotions for a cart and return the best applicable promotion
   */
  async evaluatePromotions(context: PromotionEvaluationContext): Promise<PromotionEvaluationResult> {
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
    const { selectedPromotion, conflictResolution } = await this.resolvePromotionConflicts(
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
   * Activate a scheduled promotion
   */
  async activatePromotion(id: string): Promise<void> {
    const promotion = await promotionRepository.getPromotionById(id);
    if (!promotion) {
      throw new NotFoundError('Promotion not found');
    }

    if (promotion.status !== 'scheduled' && promotion.status !== 'draft') {
      throw new ConflictError('Only scheduled or draft promotions can be activated');
    }

    const now = new Date();
    if (promotion.startsAt > now) {
      throw new ConflictError('Cannot activate promotion before its start date');
    }

    if (promotion.endsAt <= now) {
      throw new ConflictError('Cannot activate expired promotion');
    }

    await promotionRepository.updatePromotionStatus(id, 'active');
  }

  /**
   * Deactivate an active promotion
   */
  async deactivatePromotion(id: string): Promise<void> {
    const promotion = await promotionRepository.getPromotionById(id);
    if (!promotion) {
      throw new NotFoundError('Promotion not found');
    }

    if (promotion.status !== 'active') {
      throw new ConflictError('Only active promotions can be deactivated');
    }

    await promotionRepository.updatePromotionStatus(id, 'paused');
  }

  /**
   * Process scheduled promotion status updates
   */
  async processScheduledPromotions(): Promise<void> {
    const promotionsToUpdate = await promotionRepository.getPromotionsForStatusUpdate();
    
    for (const promotion of promotionsToUpdate) {
      const newStatus = this.determinePromotionStatus(promotion.startsAt, promotion.endsAt);
      if (newStatus !== promotion.status) {
        await promotionRepository.updatePromotionStatus(promotion.id, newStatus);
      }
    }
  }

  /**
   * Validate promotion usage limits
   */
  async validatePromotionUsage(promotionId: string, customerId?: string): Promise<void> {
    const promotion = await promotionRepository.getPromotionById(promotionId);
    if (!promotion) {
      throw new NotFoundError('Promotion not found');
    }

    // Check if promotion is active
    if (promotion.status !== 'active') {
      throw new PromotionExpiredError('Promotion is not active', promotionId);
    }

    // Check total usage limit
    if (promotion.usageLimit && promotion.currentUsageCount >= promotion.usageLimit) {
      throw new PromotionUsageLimitError('Promotion usage limit exceeded', promotionId);
    }

    // Check per-customer usage limit
    if (customerId && promotion.usageLimitPerCustomer) {
      const customerUsage = await promotionRepository.getCustomerPromotionUsageCount(
        promotionId,
        customerId
      );
      
      if (customerUsage >= promotion.usageLimitPerCustomer) {
        throw new PromotionUsageLimitError(
          'Customer usage limit exceeded for this promotion',
          promotionId
        );
      }
    }
  }

  /**
   * Record promotion usage after successful order
   */
  async recordPromotionUsage(
    promotionId: string,
    orderId: string,
    discountAmount: number,
    freeGifts: FreeGift[],
    cartSubtotal: number,
    customerId?: string
  ): Promise<void> {
    const promotion = await promotionRepository.getPromotionById(promotionId);
    if (!promotion) {
      throw new NotFoundError('Promotion not found');
    }

    await promotionRepository.recordPromotionUsage({
      promotionId,
      orderId,
      customerId,
      discountAmount,
      freeGifts,
      cartSubtotal,
      promotionSnapshot: promotion,
    });
  }

  /**
   * Validate promotion data
   */
  private async validatePromotionData(data: CreatePromotionDto): Promise<void> {
    // Validate required fields
    if (!data.name?.trim()) {
      throw new PromotionValidationError('Promotion name is required', 'name');
    }

    if (!data.type) {
      throw new PromotionValidationError('Promotion type is required', 'type');
    }

    // Validate dates
    const startDate = new Date(data.startsAt);
    const endDate = new Date(data.endsAt);

    if (isNaN(startDate.getTime())) {
      throw new PromotionValidationError('Invalid start date', 'startsAt');
    }

    if (isNaN(endDate.getTime())) {
      throw new PromotionValidationError('Invalid end date', 'endsAt');
    }

    if (endDate <= startDate) {
      throw new PromotionValidationError('End date must be after start date', 'endsAt');
    }

    // Validate usage limits
    if (data.usageLimit !== undefined && data.usageLimit <= 0) {
      throw new PromotionValidationError('Usage limit must be positive', 'usageLimit');
    }

    if (data.usageLimitPerCustomer !== undefined && data.usageLimitPerCustomer <= 0) {
      throw new PromotionValidationError('Usage limit per customer must be positive', 'usageLimitPerCustomer');
    }
  }

  /**
   * Validate that active promotions can only have limited changes
   */
  private validateActivePromotionUpdate(data: Partial<UpdatePromotionDto>): void {
    const restrictedFields = ['type', 'startsAt'];
    
    for (const field of restrictedFields) {
      if (data[field as keyof UpdatePromotionDto] !== undefined) {
        throw new ConflictError(`Cannot modify ${field} of an active promotion`);
      }
    }
  }

  /**
   * Validate promotion rules
   */
  private validatePromotionRules(rules: Omit<PromotionRule, 'id' | 'promotionId' | 'createdAt'>[]): void {
    const conditionRules = rules.filter(r => r.ruleType === 'condition');
    const benefitRules = rules.filter(r => r.ruleType === 'benefit');

    if (conditionRules.length === 0) {
      throw new PromotionValidationError('At least one condition rule is required');
    }

    if (benefitRules.length === 0) {
      throw new PromotionValidationError('At least one benefit rule is required');
    }

    // Validate condition rules
    for (const rule of conditionRules) {
      if (!rule.conditionType) {
        throw new PromotionValidationError('Condition type is required for condition rules');
      }

      if (!rule.operator) {
        throw new PromotionValidationError('Operator is required for condition rules');
      }

      if (rule.conditionType === 'cart_value' && !rule.numericValue) {
        throw new PromotionValidationError('Numeric value is required for cart value conditions');
      }
    }

    // Validate benefit rules
    for (const rule of benefitRules) {
      if (!rule.benefitType) {
        throw new PromotionValidationError('Benefit type is required for benefit rules');
      }

      if (rule.benefitType !== 'free_gift' && !rule.benefitValue) {
        throw new PromotionValidationError('Benefit value is required for discount benefits');
      }

      if (rule.benefitType === 'free_gift' && (!rule.giftProductIds || rule.giftProductIds.length === 0)) {
        throw new PromotionValidationError('Gift product IDs are required for free gift benefits');
      }
    }
  }

  /**
   * Determine promotion status based on dates
   */
  private determinePromotionStatus(startsAt: Date, endsAt: Date): string {
    const now = new Date();
    
    if (now < startsAt) {
      return 'scheduled';
    } else if (now >= startsAt && now < endsAt) {
      return 'active';
    } else {
      return 'expired';
    }
  }

  /**
   * Evaluate if a promotion is eligible for the given context
   */
  private async evaluatePromotionEligibility(
    promotion: Promotion,
    context: PromotionEvaluationContext
  ): Promise<EligiblePromotion | null> {
    // Get promotion rules
    const rules = await promotionRepository.getPromotionRules(promotion.id);
    const conditionRules = rules.filter(r => r.ruleType === 'condition');
    const benefitRules = rules.filter(r => r.ruleType === 'benefit');

    // Check all conditions
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
   * Evaluate a single condition rule
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
   * Evaluate cart value condition
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
   * Evaluate product quantity condition
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
   * Evaluate specific products condition
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
   * Evaluate category products condition
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
   * Calculate percentage discount
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
   * Calculate fixed discount
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

    // Don't exceed the applicable subtotal
    return Math.min(fixedAmount, applicableSubtotal);
  }

  /**
   * Calculate free gifts
   */
  private async calculateFreeGifts(benefit: PromotionRule): Promise<FreeGift[]> {
    const giftProductIds = benefit.giftProductIds || [];
    const giftQuantities = benefit.giftQuantities || [];

    if (giftProductIds.length === 0) return [];

    // Validate gift products are available
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
          value: 0, // Free gifts have no value
        });
      }
    }

    return freeGifts;
  }

  /**
   * Resolve conflicts between multiple eligible promotions
   */
  private async resolvePromotionConflicts(
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

    // Sort by priority first, then by customer benefit
    const sortedPromotions = [...eligiblePromotions].sort((a, b) => {
      // Higher priority first
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      
      // Higher customer benefit first
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
        conflictType: conflictingPromotions.length > 0 ? 'exclusivity' : 'priority',
        selectedPromotionId: selectedPromotion.promotion.id,
        rejectedPromotionIds: rejectedPromotions.map(p => p.promotion.id),
        reason: conflictingPromotions.length > 0 
          ? 'Promotion has exclusivity rules that conflict with other eligible promotions'
          : 'Selected promotion with highest priority and customer benefit',
      },
    };
  }
}

export const promotionDomain = new PromotionDomain();