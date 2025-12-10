import { promotionRepository } from './promotions.repository';
import { promotionEngine } from './promotion-engine';
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
    // Delegate to the promotion engine for evaluation
    return await promotionEngine.evaluatePromotions(context);
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


}

export const promotionDomain = new PromotionDomain();