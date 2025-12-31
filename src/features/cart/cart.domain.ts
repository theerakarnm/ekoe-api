import { cartRepository } from './cart.repository';
import { ValidationError } from '../../core/errors';
import { calculateShippingCost, isValidShippingMethod } from '../../core/config/shipping.config';
import { promotionEngine } from '../promotions/promotion-engine';
import type {
  CartItemInput,
  ValidatedCart,
  ValidatedCartItem,
  CartValidationError,
  CartPricing,
  DiscountValidation,
  FreeGift,
  ShippingMethod,
  PromotionMessage,
  NearQualifyingPromotion,
  PromotionChangeResult,
} from './cart.interface';
import type {
  PromotionEvaluationContext,
  AppliedPromotion,
  PromotionEvaluationResult,
  ConflictResolution,
  FreeGift as PromotionalFreeGift,
} from '../promotions/promotions.interface';

export class CartDomain {
  /**
   * Validate cart items against database
   */
  async validateCart(items: CartItemInput[]): Promise<ValidatedCart> {
    const validatedItems: ValidatedCartItem[] = [];
    const errors: CartValidationError[] = [];
    let subtotal = 0;

    // Get all unique product IDs
    const productIds = [...new Set(items.map(item => item.productId))];
    const validProducts = await cartRepository.validateProducts(productIds);
    const validProductMap = new Map(validProducts.map(p => [p.id, p]));

    // Get all unique variant IDs
    const variantIds = items
      .filter(item => item.variantId)
      .map(item => item.variantId!);
    const validVariants = await cartRepository.validateVariants(variantIds);
    const validVariantMap = new Map(validVariants.map(v => [v.id, v]));

    // Validate each item
    for (const item of items) {
      const product = validProductMap.get(item.productId);

      // Check if product exists and is active
      if (!product) {
        errors.push({
          productId: item.productId,
          variantId: item.variantId,
          type: 'product_not_found',
          message: `Product not found or inactive`,
        });
        continue;
      }

      let unitPrice = product.basePrice;
      let variantName: string | undefined;
      let sku: string | undefined;
      let availableQuantity = 0;
      let inStock = true;

      // Validate variant if specified
      if (item.variantId) {
        const variant = validVariantMap.get(item.variantId);

        if (!variant) {
          errors.push({
            productId: item.productId,
            variantId: item.variantId,
            type: 'product_not_found',
            message: `Product variant not found or inactive`,
          });
          continue;
        }

        unitPrice = variant.price;
        variantName = variant.name;
        sku = variant.sku || undefined;
        availableQuantity = variant.stockQuantity ?? 0;

        // Check stock availability
        if (product.trackInventory) {
          if (availableQuantity === 0) {
            inStock = false;
            errors.push({
              productId: item.productId,
              variantId: item.variantId,
              type: 'out_of_stock',
              message: `${product.name}${variantName ? ` - ${variantName}` : ''} is out of stock`,
            });
          } else if (availableQuantity < item.quantity) {
            errors.push({
              productId: item.productId,
              variantId: item.variantId,
              type: 'insufficient_stock',
              message: `Insufficient stock for ${product.name}${variantName ? ` - ${variantName}` : ''}. Available: ${availableQuantity}, Requested: ${item.quantity}`,
            });
          }
        }
      } else {
        // No variant specified, use product base price
        // For products without variants, we don't track stock at product level
        availableQuantity = 999; // Assume available if no variant
      }

      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;

      // Extract complimentary gift info from product
      let complimentaryGift: { name: string; description: string; image: string; value: number } | undefined;
      if (product.complimentaryGift && typeof product.complimentaryGift === 'object') {
        const gift = product.complimentaryGift as { name?: string; description?: string; image?: string; value?: number };
        if (gift.name) {
          complimentaryGift = {
            name: gift.name,
            description: gift.description || '',
            image: gift.image || '',
            value: gift.value || 0,
          };
        }
      }

      validatedItems.push({
        productId: item.productId,
        variantId: item.variantId,
        productName: product.name,
        variantName,
        unitPrice,
        quantity: item.quantity,
        subtotal: itemSubtotal,
        inStock,
        availableQuantity,
        sku,
        image: undefined, // Images are fetched separately if needed
        complimentaryGift,
      });
    }

    return {
      items: validatedItems,
      subtotal,
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Calculate cart pricing with server-side validation and promotion evaluation
   */
  async calculateCartPricing(
    items: CartItemInput[],
    discountCode?: string,
    shippingMethod?: string,
    customerId?: string
  ): Promise<CartPricing> {
    // First validate the cart
    const validatedCart = await this.validateCart(items);

    if (!validatedCart.isValid) {
      throw new ValidationError('Cart validation failed', {
        errors: validatedCart.errors,
      });
    }

    const subtotal = validatedCart.subtotal;

    // Evaluate promotions for the cart
    const promotionResult = await this.evaluatePromotions(validatedCart, customerId);

    // Get eligible free gifts (legacy system)
    const legacyFreeGifts = await this.getEligibleFreeGifts(items, subtotal);

    // Convert promotional gifts to legacy format and combine with legacy free gifts
    const convertedPromotionalGifts: FreeGift[] = promotionResult.freeGifts.map((gift: PromotionalFreeGift) => ({
      id: gift.productId || `gift-${Math.random().toString(36).substr(2, 9)}`, // Fallback ID for non-product gifts
      name: gift.name,
      description: `Free gift from promotion`,
      imageUrl: gift.imageUrl || '',
      value: gift.value,
      minPurchaseAmount: undefined,
      associatedProductIds: undefined,
    }));

    const allFreeGifts = [...convertedPromotionalGifts, ...legacyFreeGifts];

    // Check if discount code provides free shipping
    let hasFreeShippingDiscount = false;
    let discountCodeAmount = 0;
    let appliedDiscount;

    if (discountCode) {
      const discountValidation = await this.validateDiscountCode(discountCode, subtotal, items);
      if (discountValidation.isValid) {
        // Get the discount code details for product-specific calculation
        const dbDiscountCode = await cartRepository.getDiscountCodeByCode(discountCode);

        if (dbDiscountCode) {
          hasFreeShippingDiscount = dbDiscountCode.discountType === 'free_shipping';
          const applicableProductIds = dbDiscountCode.applicableToProducts as string[] | null;

          // Calculate discount with validated items for accurate product-specific discounts
          discountCodeAmount = this.calculateDiscountAmountWithValidatedItems(
            dbDiscountCode.discountType,
            dbDiscountCode.discountValue,
            validatedCart.items,
            dbDiscountCode.maxDiscountAmount,
            applicableProductIds
          );

          appliedDiscount = {
            code: dbDiscountCode.code,
            type: dbDiscountCode.discountType as any as 'percentage' | 'fixed_amount' | 'free_shipping',
            value: dbDiscountCode.discountValue,
            amount: discountCodeAmount,
          };
        }
      }
    }

    // Calculate shipping cost (after checking for free shipping discount)
    const shippingCost = this.calculateShippingCostWithDiscount(
      shippingMethod || 'standard',
      subtotal,
      hasFreeShippingDiscount
    );

    // If free shipping discount, set discount amount to the shipping cost that would have been charged
    if (hasFreeShippingDiscount && appliedDiscount) {
      // Calculate what shipping would have cost without the discount
      const regularShippingCost = this.calculateShippingCostWithDiscount(
        shippingMethod || 'standard',
        subtotal,
        false
      );
      discountCodeAmount = regularShippingCost;
      appliedDiscount.amount = regularShippingCost;
    }

    // Calculate total discount amount (promotional + discount code)
    const totalDiscountAmount = discountCodeAmount;

    // Calculate total
    const totalAmount = subtotal + shippingCost - totalDiscountAmount;

    return {
      subtotal,
      shippingCost,
      taxAmount: 0,
      discountAmount: totalDiscountAmount,
      totalAmount,
      discount: appliedDiscount,
      freeGifts: allFreeGifts,
      appliedPromotions: promotionResult.selectedPromotion ? [promotionResult.selectedPromotion] : [],
      promotionalDiscount: promotionResult.totalDiscount,
    };
  }

  /**
   * Calculate cart pricing with real-time promotion evaluation
   */
  async calculateCartPricingWithPromotions(
    items: CartItemInput[],
    customerId?: string,
    discountCode?: string,
    shippingMethod?: string
  ): Promise<CartPricing> {
    return this.calculateCartPricing(items, discountCode, shippingMethod, customerId);
  }

  /**
   * Evaluate promotions for a validated cart
   */
  async evaluatePromotions(
    validatedCart: ValidatedCart,
    customerId?: string
  ): Promise<PromotionEvaluationResult> {
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

    // Evaluate promotions using the promotion engine
    return await promotionEngine.evaluatePromotions(evaluationContext);
  }

  /**
   * Re-evaluate promotions when cart changes
   */
  async reEvaluatePromotions(
    items: CartItemInput[],
    customerId?: string,
    currentPromotions?: AppliedPromotion[]
  ): Promise<PromotionEvaluationResult> {
    // Validate the updated cart
    const validatedCart = await this.validateCart(items);

    if (!validatedCart.isValid) {
      // If cart is invalid, return empty promotion result
      return {
        eligiblePromotions: [],
        appliedPromotions: [],
        totalDiscount: 0,
        freeGifts: [],
      };
    }

    // Create evaluation context with current promotions
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
      currentPromotions,
    };

    return await promotionEngine.evaluatePromotions(evaluationContext);
  }

  /**
   * Get eligible free gifts for cart
   */
  async getEligibleFreeGifts(items: CartItemInput[], subtotal: number): Promise<FreeGift[]> {
    const productIds = items.map(item => item.productId);
    return await cartRepository.getEligibleGifts(subtotal, productIds);
  }

  /**
   * Validate discount code
   */
  async validateDiscountCode(
    code: string,
    subtotal: number,
    items?: CartItemInput[],
    userId?: string
  ): Promise<DiscountValidation> {
    // Get discount code from database
    const discountCode = await cartRepository.getDiscountCodeByCode(code);

    console.log(discountCode);


    if (!discountCode) {
      return {
        isValid: false,
        error: 'Invalid discount code',
        errorCode: 'INVALID_CODE',
      };
    }

    // Check if code has started
    if (discountCode.startsAt && new Date(discountCode.startsAt) > new Date()) {
      console.log('not started');

      return {
        isValid: false,
        error: 'This discount code is not yet active',
        errorCode: 'NOT_STARTED',
      };
    }

    // Check if code has expired
    if (discountCode.expiresAt && new Date(discountCode.expiresAt) < new Date()) {
      console.log('expired');

      return {
        isValid: false,
        error: 'This discount code has expired',
        errorCode: 'EXPIRED',
      };
    }

    // Check minimum purchase amount
    if (discountCode.minPurchaseAmount && subtotal < discountCode.minPurchaseAmount) {
      console.log('min purchase not met');

      return {
        isValid: false,
        error: `Minimum purchase of ${discountCode.minPurchaseAmount / 100} THB required`,
        errorCode: 'MIN_PURCHASE_NOT_MET',
      };
    }

    // Check usage limit
    if (discountCode.usageLimit) {
      const totalUsage = await cartRepository.getTotalDiscountCodeUsage(discountCode.id);
      if (totalUsage >= discountCode.usageLimit) {
        console.log('usage limit');
        return {
          isValid: false,
          error: 'This discount code has reached its usage limit',
          errorCode: 'USAGE_LIMIT_REACHED',
        };
      }
    }

    // Check per-customer usage limit
    if (discountCode.usageLimitPerCustomer && userId) {
      const customerUsage = await cartRepository.getDiscountCodeUsageCount(discountCode.id, userId);
      if (customerUsage >= discountCode.usageLimitPerCustomer) {
        console.log('usage limit per customer');

        return {
          isValid: false,
          error: 'You have already used this discount code the maximum number of times',
          errorCode: 'USAGE_LIMIT_REACHED',
        };
      }
    }

    // Calculate discount amount
    const applicableProductIds = discountCode.applicableToProducts as string[] | null;
    const discountAmount = this.calculateDiscountAmount(
      discountCode.discountType,
      discountCode.discountValue,
      subtotal,
      discountCode.maxDiscountAmount,
      applicableProductIds,
      items
    );

    console.log(discountAmount);


    return {
      isValid: true,
      code: discountCode.code,
      discountType: discountCode.discountType as 'percentage' | 'fixed_amount' | 'free_shipping',
      discountValue: discountCode.discountValue,
      discountAmount,
    };
  }

  /**
   * Calculate discount amount based on discount type
   * 
   * For product-specific discounts, we need the validated cart items to get accurate prices.
   * This is a simplified version that will be enhanced when we have validated cart items.
   */
  private calculateDiscountAmount(
    discountType: string,
    discountValue: number,
    subtotal: number,
    maxDiscountAmount?: number | null,
    applicableProductIds?: string[] | null,
    items?: CartItemInput[]
  ): number {
    // For product-specific discounts, we use the full subtotal as an approximation
    // In practice, this method should receive validated cart items with prices
    // For now, we apply the discount to the full subtotal
    let applicableSubtotal = subtotal;

    // Note: Product-specific discount calculation is simplified here
    // The actual implementation should be done with validated cart items
    // that include prices, which happens in calculateCartPricing

    let discountAmount = 0;

    switch (discountType) {
      case 'percentage':
        discountAmount = Math.round((applicableSubtotal * discountValue) / 100);
        // Apply maximum discount cap if specified
        if (maxDiscountAmount && discountAmount > maxDiscountAmount) {
          discountAmount = maxDiscountAmount;
        }
        break;

      case 'fixed_amount':
        discountAmount = Math.min(discountValue, applicableSubtotal);
        break;

      case 'free_shipping':
        // Free shipping discount amount is handled separately
        discountAmount = 0;
        break;
    }

    return discountAmount;
  }

  /**
   * Calculate discount amount with validated cart items (for accurate product-specific discounts)
   */
  private calculateDiscountAmountWithValidatedItems(
    discountType: string,
    discountValue: number,
    validatedItems: ValidatedCartItem[],
    maxDiscountAmount?: number | null,
    applicableProductIds?: string[] | null
  ): number {
    // Calculate applicable subtotal
    let applicableSubtotal = 0;

    if (applicableProductIds && applicableProductIds.length > 0) {
      // Product-specific discount: only apply to applicable products
      for (const item of validatedItems) {
        if (applicableProductIds.includes(item.productId)) {
          applicableSubtotal += item.subtotal;
        }
      }
    } else {
      // Apply to all products
      applicableSubtotal = validatedItems.reduce((sum, item) => sum + item.subtotal, 0);
    }

    let discountAmount = 0;

    switch (discountType) {
      case 'percentage':
        discountAmount = Math.round((applicableSubtotal * discountValue) / 100);
        // Apply maximum discount cap if specified
        if (maxDiscountAmount && discountAmount > maxDiscountAmount) {
          discountAmount = maxDiscountAmount;
        }
        break;

      case 'fixed_amount':
        discountAmount = Math.min(discountValue, applicableSubtotal);
        break;

      case 'free_shipping':
        // Free shipping discount amount is handled separately
        discountAmount = 0;
        break;
    }

    return discountAmount;
  }

  /**
   * Calculate shipping cost based on method
   * Supports free shipping over threshold and free shipping discounts
   */
  private calculateShippingCostWithDiscount(
    method: string,
    subtotal: number,
    hasFreeShippingDiscount: boolean = false
  ): number {
    // Free shipping if discount code provides it
    if (hasFreeShippingDiscount) {
      return 0;
    }

    // Free shipping over 1000 THB (100000 cents)
    if (subtotal >= 100000) {
      return 0;
    }

    // Validate shipping method
    if (!isValidShippingMethod(method)) {
      method = 'standard'; // Default to standard if invalid
    }

    // Use centralized shipping cost calculation
    return calculateShippingCost(method);
  }

  /**
   * Get available shipping methods
   */
  getShippingMethods(): ShippingMethod[] {
    // Import and return shipping methods from centralized config
    const { getAllShippingMethods } = require('../../core/config/shipping.config');
    return getAllShippingMethods();
  }

  /**
   * Generate promotion messages for near-qualifying customers
   */
  async generatePromotionMessages(
    validatedCart: ValidatedCart,
    promotionResult: PromotionEvaluationResult,
    customerId?: string
  ): Promise<PromotionMessage[]> {
    const messages: PromotionMessage[] = [];

    // Add benefit explanation for applied promotions
    if (promotionResult.selectedPromotion) {
      messages.push({
        type: 'benefit_explanation',
        message: `You saved ${promotionResult.selectedPromotion.discountAmount / 100} THB with "${promotionResult.selectedPromotion.promotionName}"`,
        promotionId: promotionResult.selectedPromotion.promotionId,
        promotionName: promotionResult.selectedPromotion.promotionName,
        currentBenefit: promotionResult.selectedPromotion.discountAmount,
      });

      // Add gift information if applicable
      if (promotionResult.selectedPromotion.freeGifts.length > 0) {
        const giftNames = promotionResult.selectedPromotion.freeGifts.map(g => g.name).join(', ');
        messages.push({
          type: 'benefit_explanation',
          message: `You received free gifts: ${giftNames}`,
          promotionId: promotionResult.selectedPromotion.promotionId,
          promotionName: promotionResult.selectedPromotion.promotionName,
        });
      }
    }

    // Add selection reason if multiple promotions were eligible
    if (promotionResult.conflictResolution && promotionResult.eligiblePromotions.length > 1) {
      messages.push({
        type: 'selection_reason',
        message: promotionResult.conflictResolution.reason,
        promotionId: promotionResult.conflictResolution.selectedPromotionId,
      });
    }

    // Find near-qualifying promotions
    const nearQualifyingPromotions = await this.findNearQualifyingPromotions(validatedCart, customerId);

    for (const nearPromotion of nearQualifyingPromotions) {
      messages.push({
        type: 'near_qualifying',
        message: nearPromotion.message,
        promotionId: nearPromotion.promotionId,
        promotionName: nearPromotion.promotionName,
        amountNeeded: nearPromotion.amountNeeded,
        potentialBenefit: nearPromotion.potentialDiscount,
      });
    }

    return messages;
  }

  /**
   * Find promotions that customers are close to qualifying for
   */
  async findNearQualifyingPromotions(
    validatedCart: ValidatedCart,
    customerId?: string
  ): Promise<NearQualifyingPromotion[]> {
    // This is a simplified implementation
    // In a full implementation, you would check all active promotions
    // and see which ones the customer is close to qualifying for

    const nearQualifying: NearQualifyingPromotion[] = [];

    // Example: Check for cart value thresholds
    const commonThresholds = [50000, 100000, 150000, 200000]; // 500, 1000, 1500, 2000 THB

    for (const threshold of commonThresholds) {
      if (validatedCart.subtotal < threshold) {
        const amountNeeded = threshold - validatedCart.subtotal;

        // Only show if they're within 50% of the threshold
        if (amountNeeded <= threshold * 0.5) {
          nearQualifying.push({
            promotionId: `threshold-${threshold}`,
            promotionName: `Spend ${threshold / 100} THB Promotion`,
            amountNeeded,
            potentialDiscount: Math.round(threshold * 0.1), // 10% discount example
            potentialGifts: [],
            message: `Add ${amountNeeded / 100} THB more to unlock a special promotion!`,
          });
        }
        break; // Only show the next threshold
      }
    }

    return nearQualifying;
  }

  /**
   * Calculate cart pricing with promotion messages
   */
  async calculateCartPricingWithMessages(
    items: CartItemInput[],
    customerId?: string,
    discountCode?: string,
    shippingMethod?: string
  ): Promise<CartPricing> {
    const pricing = await this.calculateCartPricing(items, discountCode, shippingMethod, customerId);

    // Generate promotion messages if we have promotion data
    if (pricing.appliedPromotions && pricing.appliedPromotions.length > 0) {
      const validatedCart = await this.validateCart(items);
      const promotionResult: PromotionEvaluationResult = {
        eligiblePromotions: [],
        appliedPromotions: pricing.appliedPromotions,
        selectedPromotion: pricing.appliedPromotions[0],
        totalDiscount: pricing.promotionalDiscount || 0,
        freeGifts: pricing.appliedPromotions[0].freeGifts,
      };

      const messages = await this.generatePromotionMessages(validatedCart, promotionResult, customerId);
      pricing.promotionMessages = messages;
    }

    return pricing;
  }

  /**
   * Validate and update cart with automatic promotion removal
   */
  async validateCartWithPromotionRemoval(
    items: CartItemInput[],
    currentPromotions: AppliedPromotion[],
    customerId?: string
  ): Promise<{
    validatedCart: ValidatedCart;
    updatedPromotions: AppliedPromotion[];
    removedPromotions: AppliedPromotion[];
    promotionChanges: PromotionChangeResult[];
  }> {
    // First validate the base cart
    const validatedCart = await this.validateCart(items);

    if (!validatedCart.isValid) {
      // If cart is invalid, remove all promotions
      return {
        validatedCart,
        updatedPromotions: [],
        removedPromotions: currentPromotions,
        promotionChanges: currentPromotions.map(p => ({
          type: 'removed',
          promotion: p,
          reason: 'Cart validation failed',
        })),
      };
    }

    // Re-evaluate promotions with current cart
    const newPromotionResult = await this.evaluatePromotions(validatedCart, customerId);

    // Compare current promotions with newly eligible promotions
    const promotionChanges = this.comparePromotions(currentPromotions, newPromotionResult);

    return {
      validatedCart,
      updatedPromotions: newPromotionResult.selectedPromotion ? [newPromotionResult.selectedPromotion] : [],
      removedPromotions: promotionChanges.filter(c => c.type === 'removed').map(c => c.promotion),
      promotionChanges,
    };
  }

  /**
   * Handle cart quantity changes with promotion re-evaluation
   */
  async handleCartQuantityChange(
    items: CartItemInput[],
    changedItem: { productId: string; variantId?: string; oldQuantity: number; newQuantity: number },
    currentPromotions: AppliedPromotion[],
    customerId?: string
  ): Promise<{
    updatedPricing: CartPricing;
    promotionChanges: PromotionChangeResult[];
    messages: PromotionMessage[];
  }> {
    // Validate cart with promotion removal logic
    const validationResult = await this.validateCartWithPromotionRemoval(items, currentPromotions, customerId);

    // Calculate new pricing
    const updatedPricing = await this.calculateCartPricing(items, undefined, undefined, customerId);

    // Generate messages about promotion changes
    const messages = await this.generatePromotionChangeMessages(
      validationResult.promotionChanges,
      changedItem,
      validationResult.validatedCart
    );

    return {
      updatedPricing,
      promotionChanges: validationResult.promotionChanges,
      messages,
    };
  }

  /**
   * Resolve promotion conflicts during cart updates
   */
  async resolvePromotionConflicts(
    items: CartItemInput[],
    conflictingPromotions: AppliedPromotion[],
    customerId?: string
  ): Promise<{
    resolvedPromotions: AppliedPromotion[];
    conflictResolution: ConflictResolution;
  }> {
    // Validate cart first
    const validatedCart = await this.validateCart(items);

    if (!validatedCart.isValid) {
      return {
        resolvedPromotions: [],
        conflictResolution: {
          conflictType: 'priority',
          selectedPromotionId: '',
          rejectedPromotionIds: conflictingPromotions.map(p => p.promotionId),
          reason: 'All promotions removed due to cart validation failure',
        },
      };
    }

    // Re-evaluate promotions to get the optimal selection
    const promotionResult = await this.evaluatePromotions(validatedCart, customerId);

    return {
      resolvedPromotions: promotionResult.selectedPromotion ? [promotionResult.selectedPromotion] : [],
      conflictResolution: promotionResult.conflictResolution || {
        conflictType: 'customer_benefit',
        selectedPromotionId: promotionResult.selectedPromotion?.promotionId || '',
        rejectedPromotionIds: conflictingPromotions
          .filter(p => p.promotionId !== promotionResult.selectedPromotion?.promotionId)
          .map(p => p.promotionId),
        reason: 'Selected promotion with highest customer benefit',
      },
    };
  }

  /**
   * Compare current promotions with newly evaluated promotions
   */
  private comparePromotions(
    currentPromotions: AppliedPromotion[],
    newPromotionResult: PromotionEvaluationResult
  ): PromotionChangeResult[] {
    const changes: PromotionChangeResult[] = [];

    // Check for removed promotions
    for (const currentPromotion of currentPromotions) {
      const stillApplied = newPromotionResult.selectedPromotion?.promotionId === currentPromotion.promotionId;

      if (!stillApplied) {
        changes.push({
          type: 'removed',
          promotion: currentPromotion,
          reason: 'Cart no longer qualifies for this promotion',
        });
      }
    }

    // Check for new promotions
    if (newPromotionResult.selectedPromotion) {
      const wasAlreadyApplied = currentPromotions.some(
        p => p.promotionId === newPromotionResult.selectedPromotion!.promotionId
      );

      if (!wasAlreadyApplied) {
        changes.push({
          type: 'added',
          promotion: newPromotionResult.selectedPromotion,
          reason: 'Cart now qualifies for this promotion',
        });
      } else {
        // Check if promotion benefits changed
        const currentPromotion = currentPromotions.find(
          p => p.promotionId === newPromotionResult.selectedPromotion!.promotionId
        );

        if (currentPromotion && currentPromotion.discountAmount !== newPromotionResult.selectedPromotion.discountAmount) {
          changes.push({
            type: 'updated',
            promotion: newPromotionResult.selectedPromotion,
            previousPromotion: currentPromotion,
            reason: 'Promotion benefits updated due to cart changes',
          });
        }
      }
    }

    return changes;
  }

  /**
   * Generate messages about promotion changes
   */
  private async generatePromotionChangeMessages(
    promotionChanges: PromotionChangeResult[],
    changedItem: { productId: string; variantId?: string; oldQuantity: number; newQuantity: number },
    validatedCart: ValidatedCart
  ): Promise<PromotionMessage[]> {
    const messages: PromotionMessage[] = [];

    for (const change of promotionChanges) {
      switch (change.type) {
        case 'removed':
          messages.push({
            type: 'benefit_explanation',
            message: `Promotion "${change.promotion.promotionName}" was removed because your cart no longer qualifies`,
            promotionId: change.promotion.promotionId,
            promotionName: change.promotion.promotionName,
          });
          break;

        case 'added':
          messages.push({
            type: 'benefit_explanation',
            message: `Great! You now qualify for "${change.promotion.promotionName}" and saved ${change.promotion.discountAmount / 100} THB`,
            promotionId: change.promotion.promotionId,
            promotionName: change.promotion.promotionName,
            currentBenefit: change.promotion.discountAmount,
          });
          break;

        case 'updated':
          const oldBenefit = change.previousPromotion?.discountAmount || 0;
          const newBenefit = change.promotion.discountAmount;
          const difference = newBenefit - oldBenefit;

          messages.push({
            type: 'benefit_explanation',
            message: difference > 0
              ? `Your savings increased by ${difference / 100} THB with "${change.promotion.promotionName}"`
              : `Your savings decreased by ${Math.abs(difference) / 100} THB with "${change.promotion.promotionName}"`,
            promotionId: change.promotion.promotionId,
            promotionName: change.promotion.promotionName,
            currentBenefit: newBenefit,
          });
          break;
      }
    }

    return messages;
  }
}

export const cartDomain = new CartDomain();
