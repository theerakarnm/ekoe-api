import { promotionRepository } from './promotions.repository';
import {
  ValidationError,
  UnauthorizedError,
  ForbiddenError
} from '../../core/errors';
import type {
  Promotion,
  PromotionEvaluationContext,
  AppliedPromotion,
  FreeGift,
  CartItem
} from './promotions.interface';
import {
  PromotionValidationError,
  PromotionUsageLimitError
} from './promotions.interface';

/**
 * Security validation and audit system for promotions
 * Implements server-side calculation validation, suspicious activity detection,
 * and high-value promotion additional validation
 */
export class PromotionSecurity {
  private readonly HIGH_VALUE_THRESHOLD = 500000; // 5,000 THB in cents
  private readonly MAX_REASONABLE_DISCOUNT = 5000000; // 50,000 THB in cents
  private readonly MAX_GIFT_QUANTITY_PER_PROMOTION = 10;
  private readonly CALCULATION_TOLERANCE = 1; // 1 cent tolerance for rounding
  private readonly SUSPICIOUS_ACTIVITY_THRESHOLD = 5; // Number of failed validations before flagging

  /**
   * Validate promotion calculations to prevent tampering
   * This is the main server-side validation method called during promotion evaluation
   */
  async validatePromotionCalculations(
    context: PromotionEvaluationContext,
    appliedPromotion: AppliedPromotion,
    promotion: Promotion
  ): Promise<void> {
    try {
      // 1. Validate cart context integrity
      this.validateCartContextIntegrity(context);

      // 2. Validate discount calculation accuracy
      await this.validateDiscountCalculationAccuracy(context, appliedPromotion, promotion);

      // 3. Validate free gift calculations
      await this.validateFreeGiftCalculations(context, appliedPromotion, promotion);

      // 4. Validate high-value promotion requirements
      if (appliedPromotion.discountAmount > this.HIGH_VALUE_THRESHOLD) {
        await this.validateHighValuePromotion(context, appliedPromotion, promotion);
      }

      // 5. Validate usage limits haven't been bypassed
      if (context.customerId) {
        await this.validateUsageLimitsBypass(promotion, context.customerId);
      }

      // 6. Validate promotion is still active and eligible
      await this.validatePromotionEligibility(promotion, context);

    } catch (error) {
      // Log suspicious activity for audit
      await this.logSuspiciousActivity(context, appliedPromotion, promotion, error as Error);
      throw error;
    }
  }

  /**
   * Validate cart context integrity to prevent manipulation
   */
  private validateCartContextIntegrity(context: PromotionEvaluationContext): void {
    // Validate cart items structure
    if (!context.cartItems || !Array.isArray(context.cartItems)) {
      throw new ValidationError('Invalid cart items structure');
    }

    if (context.cartItems.length === 0) {
      throw new ValidationError('Cart cannot be empty for promotion evaluation');
    }

    // Validate each cart item
    for (const item of context.cartItems) {
      this.validateCartItem(item);
    }

    // Recalculate and validate cart subtotal
    const recalculatedSubtotal = context.cartItems.reduce(
      (sum, item) => sum + item.subtotal,
      0
    );

    const subtotalDifference = Math.abs(recalculatedSubtotal - context.cartSubtotal);
    if (subtotalDifference > this.CALCULATION_TOLERANCE) {
      throw new ValidationError(
        `Cart subtotal mismatch detected. Expected: ${recalculatedSubtotal}, Got: ${context.cartSubtotal}. Difference: ${subtotalDifference}`
      );
    }

    // Validate individual item calculations
    for (const item of context.cartItems) {
      const expectedSubtotal = item.unitPrice * item.quantity;
      const itemDifference = Math.abs(expectedSubtotal - item.subtotal);

      if (itemDifference > this.CALCULATION_TOLERANCE) {
        throw new ValidationError(
          `Item subtotal mismatch for product ${item.productId}. Expected: ${expectedSubtotal}, Got: ${item.subtotal}`
        );
      }
    }
  }

  /**
   * Validate individual cart item structure and values
   */
  private validateCartItem(item: CartItem): void {
    if (!item.productId || typeof item.productId !== 'string') {
      throw new ValidationError('Cart item must have valid product ID');
    }

    if (typeof item.quantity !== 'number' || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
      throw new ValidationError(`Invalid quantity for product ${item.productId}: ${item.quantity}`);
    }

    if (typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
      throw new ValidationError(`Invalid unit price for product ${item.productId}: ${item.unitPrice}`);
    }

    if (typeof item.subtotal !== 'number' || item.subtotal < 0) {
      throw new ValidationError(`Invalid subtotal for product ${item.productId}: ${item.subtotal}`);
    }

    // Validate reasonable bounds
    if (item.quantity > 1000) {
      throw new ValidationError(`Excessive quantity detected for product ${item.productId}: ${item.quantity}`);
    }

    if (item.unitPrice > 10000000) { // 100,000 THB per item
      throw new ValidationError(`Excessive unit price detected for product ${item.productId}: ${item.unitPrice}`);
    }
  }

  /**
   * Validate discount calculation accuracy by recalculating server-side
   */
  private async validateDiscountCalculationAccuracy(
    context: PromotionEvaluationContext,
    appliedPromotion: AppliedPromotion,
    promotion: Promotion
  ): Promise<void> {
    // Get promotion rules to recalculate discount
    const rules = await promotionRepository.getPromotionRules(promotion.id);
    const benefitRules = rules.filter(r => r.ruleType === 'benefit');

    // Filter out free_gift rules - they don't contribute to discount calculation
    const discountBenefitRules = benefitRules.filter(r =>
      r.benefitType === 'percentage_discount' || r.benefitType === 'fixed_discount'
    );

    // If there are no discount benefit rules, skip discount validation
    // (e.g., free_gift only promotions)
    if (discountBenefitRules.length === 0) {
      // Only validate that applied discount is 0 for gift-only promotions
      if (appliedPromotion.discountAmount !== 0) {
        throw new ValidationError(
          `Gift-only promotion should have 0 discount, got: ${appliedPromotion.discountAmount}`
        );
      }
      return;
    }

    let expectedDiscount = 0;

    for (const benefit of discountBenefitRules) {
      switch (benefit.benefitType) {
        case 'percentage_discount':
          expectedDiscount += this.calculateExpectedPercentageDiscount(benefit, context);
          break;
        case 'fixed_discount':
          expectedDiscount += this.calculateExpectedFixedDiscount(benefit, context);
          break;
      }
    }

    // Apply discount capping
    expectedDiscount = this.applySecurityDiscountCapping(expectedDiscount, discountBenefitRules[0], context);

    // Validate calculated discount matches expected
    const discountDifference = Math.abs(expectedDiscount - appliedPromotion.discountAmount);
    if (discountDifference > this.CALCULATION_TOLERANCE) {
      throw new ValidationError(
        `Discount calculation mismatch. Expected: ${expectedDiscount}, Got: ${appliedPromotion.discountAmount}. Difference: ${discountDifference}`
      );
    }

    // Validate discount doesn't exceed cart subtotal
    if (appliedPromotion.discountAmount > context.cartSubtotal) {
      throw new ValidationError(
        `Discount amount (${appliedPromotion.discountAmount}) exceeds cart subtotal (${context.cartSubtotal})`
      );
    }

    // Validate discount is within reasonable bounds
    if (appliedPromotion.discountAmount > this.MAX_REASONABLE_DISCOUNT) {
      throw new ValidationError(
        `Discount amount exceeds maximum reasonable limit: ${appliedPromotion.discountAmount}`
      );
    }
  }

  /**
   * Calculate expected percentage discount for validation
   */
  private calculateExpectedPercentageDiscount(benefit: any, context: PromotionEvaluationContext): number {
    const percentage = benefit.benefitValue || 0;

    if (percentage < 0 || percentage > 100) {
      throw new ValidationError(`Invalid percentage value: ${percentage}`);
    }

    let applicableSubtotal = context.cartSubtotal;

    // Apply to specific products if specified
    if (benefit.applicableProductIds && benefit.applicableProductIds.length > 0) {
      applicableSubtotal = context.cartItems
        .filter(item => benefit.applicableProductIds.includes(item.productId))
        .reduce((sum, item) => sum + item.subtotal, 0);
    }

    return Math.round((applicableSubtotal * percentage) / 100);
  }

  /**
   * Calculate expected fixed discount for validation
   */
  private calculateExpectedFixedDiscount(benefit: any, context: PromotionEvaluationContext): number {
    const fixedAmount = benefit.benefitValue || 0;

    if (fixedAmount < 0) {
      throw new ValidationError(`Invalid fixed discount amount: ${fixedAmount}`);
    }

    let applicableSubtotal = context.cartSubtotal;

    // Apply to specific products if specified
    if (benefit.applicableProductIds && benefit.applicableProductIds.length > 0) {
      applicableSubtotal = context.cartItems
        .filter(item => benefit.applicableProductIds.includes(item.productId))
        .reduce((sum, item) => sum + item.subtotal, 0);
    }

    return Math.min(fixedAmount, applicableSubtotal);
  }

  /**
   * Apply security-focused discount capping
   */
  private applySecurityDiscountCapping(
    discountAmount: number,
    benefit: any,
    context: PromotionEvaluationContext
  ): number {
    let cappedDiscount = Math.max(0, discountAmount);

    // Apply maximum discount cap if specified
    if (benefit?.maxDiscountAmount && cappedDiscount > benefit.maxDiscountAmount) {
      cappedDiscount = benefit.maxDiscountAmount;
    }

    // Don't exceed cart subtotal
    if (cappedDiscount > context.cartSubtotal) {
      cappedDiscount = context.cartSubtotal;
    }

    // Apply absolute maximum for security
    if (cappedDiscount > this.MAX_REASONABLE_DISCOUNT) {
      cappedDiscount = this.MAX_REASONABLE_DISCOUNT;
    }

    return Math.round(cappedDiscount);
  }

  /**
   * Validate free gift calculations and inventory availability
   */
  private async validateFreeGiftCalculations(
    context: PromotionEvaluationContext,
    appliedPromotion: AppliedPromotion,
    promotion: Promotion
  ): Promise<void> {
    if (!appliedPromotion.freeGifts || appliedPromotion.freeGifts.length === 0) {
      return; // No gifts to validate
    }

    // Validate total gift quantity is reasonable
    const totalGiftQuantity = appliedPromotion.freeGifts.reduce((sum, gift) => sum + gift.quantity, 0);
    if (totalGiftQuantity > this.MAX_GIFT_QUANTITY_PER_PROMOTION) {
      throw new ValidationError(
        `Excessive gift quantity detected: ${totalGiftQuantity}. Maximum allowed: ${this.MAX_GIFT_QUANTITY_PER_PROMOTION}`
      );
    }

    // Validate each gift
    for (const gift of appliedPromotion.freeGifts) {
      await this.validateFreeGift(gift, promotion);
    }

    // Validate gifts match promotion rules
    await this.validateGiftsMatchPromotionRules(appliedPromotion.freeGifts, promotion, context);
  }

  /**
   * Validate individual free gift
   * Supports both product-based gifts and standalone admin-created gifts
   */
  private async validateFreeGift(gift: FreeGift, promotion: Promotion): Promise<void> {
    // Validate quantity for all gift types
    if (typeof gift.quantity !== 'number' || gift.quantity <= 0 || !Number.isInteger(gift.quantity)) {
      throw new ValidationError(`Invalid gift quantity: ${gift.quantity}`);
    }

    if (gift.quantity > 5) { // Reasonable limit per gift
      throw new ValidationError(`Excessive quantity for single gift: ${gift.quantity}`);
    }

    // Case 1: Standalone admin-created gift (no productId but has name)
    // These are gifts created in admin with just name and image, not linked to a product
    if (!gift.productId && gift.name) {
      // Validate the gift has required fields for display
      if (typeof gift.name !== 'string' || gift.name.trim().length === 0) {
        throw new ValidationError('Standalone gift must have a valid name');
      }
      // Standalone gifts are valid without inventory check
      return;
    }

    // Case 2: Product-based gift - must have valid productId
    if (!gift.productId) {
      throw new ValidationError('Free gift must have valid product ID or name');
    }

    // Validate gift product exists and is available
    const giftProducts = await promotionRepository.validateGiftProductsWithStock([gift.productId]);
    const giftProduct = giftProducts.find(p => p.id === gift.productId);

    if (!giftProduct) {
      throw new ValidationError(`Gift product not found: ${gift.productId}`);
    }

    if (!giftProduct.inStock || giftProduct.availableQuantity < gift.quantity) {
      throw new ValidationError(
        `Gift product ${gift.productId} is not available in required quantity: ${gift.quantity}`
      );
    }
  }

  /**
   * Validate gifts match promotion rules
   * Supports both product-based gifts and standalone admin-created gifts
   */
  private async validateGiftsMatchPromotionRules(
    gifts: FreeGift[],
    promotion: Promotion,
    context: PromotionEvaluationContext
  ): Promise<void> {
    const rules = await promotionRepository.getPromotionRules(promotion.id);
    const giftBenefitRules = rules.filter(r => r.ruleType === 'benefit' && r.benefitType === 'free_gift');

    if (giftBenefitRules.length === 0) {
      throw new ValidationError('No gift benefit rules found for promotion with free gifts');
    }

    // Validate each gift is allowed by promotion rules
    for (const gift of gifts) {
      let giftAllowed = false;

      for (const rule of giftBenefitRules) {
        // Case 1: Standalone admin-created gift (matches by name)
        if (!gift.productId && gift.name && rule.giftName === gift.name) {
          if (await this.validateGiftTierQualification(rule, context)) {
            giftAllowed = true;
            break;
          }
        }

        // Case 2: Product-based gift (matches by productId)
        if (gift.productId && rule.giftProductIds && rule.giftProductIds.includes(gift.productId)) {
          if (await this.validateGiftTierQualification(rule, context)) {
            giftAllowed = true;
            break;
          }
        }
      }

      if (!giftAllowed) {
        throw new ValidationError(`Gift "${gift.name || gift.productId}" is not allowed by promotion rules`);
      }
    }
  }

  /**
   * Validate cart qualifies for specific gift tier
   */
  private async validateGiftTierQualification(rule: any, context: PromotionEvaluationContext): Promise<boolean> {
    const threshold = rule.numericValue || 0;
    return context.cartSubtotal >= threshold;
  }

  /**
   * Validate high-value promotion requirements
   */
  private async validateHighValuePromotion(
    context: PromotionEvaluationContext,
    appliedPromotion: AppliedPromotion,
    promotion: Promotion
  ): Promise<void> {
    // Log high-value promotion application for audit
    console.warn(`High-value promotion applied: ${promotion.id}, discount: ${appliedPromotion.discountAmount}, customer: ${context.customerId}`);

    // Validate promotion has reasonable usage limits
    if (!promotion.usageLimit || promotion.usageLimit > 1000) {
      throw new ValidationError(
        `High-value promotion must have reasonable usage limits (current: ${promotion.usageLimit})`
      );
    }

    // Validate discount doesn't exceed 80% of cart value
    const discountPercentage = (appliedPromotion.discountAmount / context.cartSubtotal) * 100;
    if (discountPercentage > 80) {
      throw new ValidationError(
        `High-value promotion discount (${discountPercentage.toFixed(2)}%) exceeds 80% of cart value`
      );
    }

    // Validate customer has reasonable purchase history (if customer ID provided)
    if (context.customerId) {
      await this.validateCustomerEligibilityForHighValuePromotion(context.customerId, appliedPromotion.discountAmount);
    }

    // Additional validation for extremely high values
    if (appliedPromotion.discountAmount > this.HIGH_VALUE_THRESHOLD * 4) { // 20,000 THB
      throw new ValidationError(
        `Extremely high discount amount requires manual approval: ${appliedPromotion.discountAmount}`
      );
    }
  }

  /**
   * Validate customer eligibility for high-value promotions
   */
  private async validateCustomerEligibilityForHighValuePromotion(
    customerId: string,
    discountAmount: number
  ): Promise<void> {
    // Check customer's promotion usage history
    const recentUsage = await this.getCustomerRecentPromotionUsage(customerId);

    // Prevent excessive high-value promotion usage
    const recentHighValueUsage = recentUsage.filter(usage => usage.discountAmount > this.HIGH_VALUE_THRESHOLD);

    if (recentHighValueUsage.length > 3) { // More than 3 high-value promotions recently
      throw new ValidationError(
        `Customer ${customerId} has exceeded high-value promotion usage limits`
      );
    }

    // Check for suspicious patterns (e.g., multiple high-value promotions in short time)
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent24HourUsage = recentUsage.filter(usage => usage.createdAt > last24Hours);

    if (recent24HourUsage.length > 5) {
      throw new ValidationError(
        `Suspicious promotion usage pattern detected for customer ${customerId}`
      );
    }
  }

  /**
   * Get customer's recent promotion usage for validation
   */
  private async getCustomerRecentPromotionUsage(customerId: string): Promise<Array<{
    discountAmount: number;
    createdAt: Date;
  }>> {
    // This would typically query the promotion usage table
    // For now, return empty array as placeholder
    return [];
  }

  /**
   * Validate usage limits haven't been bypassed
   */
  private async validateUsageLimitsBypass(promotion: Promotion, customerId: string): Promise<void> {
    // Check total usage limit
    if (promotion.usageLimit && promotion.currentUsageCount >= promotion.usageLimit) {
      throw new PromotionUsageLimitError(
        `Promotion usage limit exceeded: ${promotion.currentUsageCount}/${promotion.usageLimit}`,
        promotion.id
      );
    }

    // Check per-customer usage limit
    if (promotion.usageLimitPerCustomer) {
      const customerUsage = await promotionRepository.getCustomerPromotionUsageCount(
        promotion.id,
        customerId
      );

      if (customerUsage >= promotion.usageLimitPerCustomer) {
        throw new PromotionUsageLimitError(
          `Customer usage limit exceeded: ${customerUsage}/${promotion.usageLimitPerCustomer}`,
          promotion.id
        );
      }
    }
  }

  /**
   * Validate promotion is still active and eligible
   */
  private async validatePromotionEligibility(promotion: Promotion, context: PromotionEvaluationContext): Promise<void> {
    const now = new Date();

    // Check promotion status
    if (promotion.status !== 'active') {
      throw new ValidationError(`Promotion is not active: ${promotion.status}`);
    }

    // Check promotion time bounds
    if (now < promotion.startsAt) {
      throw new ValidationError(`Promotion has not started yet: ${promotion.startsAt}`);
    }

    if (now >= promotion.endsAt) {
      throw new ValidationError(`Promotion has expired: ${promotion.endsAt}`);
    }

    // Validate promotion hasn't been deleted
    if (promotion.deletedAt) {
      throw new ValidationError(`Promotion has been deleted: ${promotion.deletedAt}`);
    }
  }

  /**
   * Log suspicious activity for audit and monitoring
   */
  private async logSuspiciousActivity(
    context: PromotionEvaluationContext,
    appliedPromotion: AppliedPromotion,
    promotion: Promotion,
    error: Error
  ): Promise<void> {
    const suspiciousActivity = {
      timestamp: new Date(),
      promotionId: promotion.id,
      customerId: context.customerId,
      errorType: error.constructor.name,
      errorMessage: error.message,
      cartSubtotal: context.cartSubtotal,
      appliedDiscount: appliedPromotion.discountAmount,
      cartItemCount: context.cartItems.length,
      ipAddress: 'unknown', // Would be passed from request context
      userAgent: 'unknown', // Would be passed from request context
    };

    // Log to console for now (in production, this would go to a security monitoring system)
    console.error('SUSPICIOUS PROMOTION ACTIVITY DETECTED:', JSON.stringify(suspiciousActivity, null, 2));

    // In production, you might also:
    // - Store in a security audit table
    // - Send alerts to security team
    // - Implement rate limiting based on suspicious activity
    // - Block customer temporarily if too many violations
  }

  /**
   * Detect and prevent promotion abuse patterns
   */
  async detectPromotionAbuse(customerId: string, promotionId: string): Promise<{
    isAbusive: boolean;
    reason?: string;
    recommendedAction?: string;
  }> {
    if (!customerId) {
      return { isAbusive: false };
    }

    // Check for rapid repeated attempts
    const recentAttempts = await this.getRecentPromotionAttempts(customerId, promotionId);
    if (recentAttempts > 10) { // More than 10 attempts in recent period
      return {
        isAbusive: true,
        reason: 'Excessive promotion attempts detected',
        recommendedAction: 'Temporarily block customer from this promotion'
      };
    }

    // Check for unusual cart manipulation patterns
    const cartManipulationScore = await this.calculateCartManipulationScore(customerId);
    if (cartManipulationScore > 0.8) { // High manipulation score
      return {
        isAbusive: true,
        reason: 'Suspicious cart manipulation patterns detected',
        recommendedAction: 'Require manual review for high-value promotions'
      };
    }

    return { isAbusive: false };
  }

  /**
   * Get recent promotion attempts for abuse detection
   */
  private async getRecentPromotionAttempts(customerId: string, promotionId: string): Promise<number> {
    // This would query attempt logs in production
    // For now, return 0 as placeholder
    return 0;
  }

  /**
   * Calculate cart manipulation score based on patterns
   */
  private async calculateCartManipulationScore(customerId: string): Promise<number> {
    // This would analyze customer behavior patterns
    // For now, return 0 as placeholder
    return 0;
  }

  /**
   * Validate promotion application request for security
   */
  async validatePromotionApplicationRequest(
    context: PromotionEvaluationContext,
    requestMetadata?: {
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
    }
  ): Promise<void> {
    // Validate request rate limiting
    if (requestMetadata?.ipAddress) {
      await this.validateRequestRateLimit(requestMetadata.ipAddress);
    }

    // Validate session integrity
    if (requestMetadata?.sessionId && context.customerId) {
      await this.validateSessionIntegrity(requestMetadata.sessionId, context.customerId);
    }

    // Validate cart hasn't been tampered with
    await this.validateCartTampering(context);
  }

  /**
   * Validate request rate limiting to prevent abuse
   */
  private async validateRequestRateLimit(ipAddress: string): Promise<void> {
    // This would implement rate limiting logic
    // For now, just log the IP for audit
    console.log(`Promotion evaluation request from IP: ${ipAddress}`);
  }

  /**
   * Validate session integrity
   */
  private async validateSessionIntegrity(sessionId: string, customerId: string): Promise<void> {
    // This would validate the session belongs to the customer
    // For now, just log for audit
    console.log(`Session validation for customer ${customerId}, session: ${sessionId}`);
  }

  /**
   * Validate cart hasn't been tampered with
   */
  private async validateCartTampering(context: PromotionEvaluationContext): Promise<void> {
    // Check for unrealistic cart values
    const averageItemPrice = context.cartSubtotal / context.cartItems.length;

    if (averageItemPrice > 5000000) { // 50,000 THB average per item
      throw new ValidationError('Unrealistic cart values detected - possible tampering');
    }

    // Check for duplicate products/variants with different prices
    // Use variantId when available (different variants can have different prices)
    const itemPrices = new Map<string, number>();
    for (const item of context.cartItems) {
      // Use variantId if available, otherwise fallback to productId
      // This allows different variants of the same product to have different prices
      const itemKey = item.variantId || item.productId;
      const existingPrice = itemPrices.get(itemKey);
      if (existingPrice && Math.abs(existingPrice - item.unitPrice) > this.CALCULATION_TOLERANCE) {
        throw new ValidationError(
          `Inconsistent pricing detected for item ${itemKey}: ${existingPrice} vs ${item.unitPrice}`
        );
      }
      itemPrices.set(itemKey, item.unitPrice);
    }
  }
}

export const promotionSecurity = new PromotionSecurity();