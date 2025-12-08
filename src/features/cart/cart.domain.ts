import { cartRepository } from './cart.repository';
import { ValidationError } from '../../core/errors';
import { calculateShippingCost, isValidShippingMethod } from '../../core/config/shipping.config';
import type {
  CartItemInput,
  ValidatedCart,
  ValidatedCartItem,
  CartValidationError,
  CartPricing,
  DiscountValidation,
  FreeGift,
  ShippingMethod,
} from './cart.interface';

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
   * Calculate cart pricing with server-side validation
   */
  async calculateCartPricing(
    items: CartItemInput[],
    discountCode?: string,
    shippingMethod?: string
  ): Promise<CartPricing> {
    // First validate the cart
    const validatedCart = await this.validateCart(items);

    if (!validatedCart.isValid) {
      throw new ValidationError('Cart validation failed', {
        errors: validatedCart.errors,
      });
    }

    const subtotal = validatedCart.subtotal;

    // Get eligible free gifts
    const freeGifts = await this.getEligibleFreeGifts(items, subtotal);

    // Check if discount code provides free shipping
    let hasFreeShippingDiscount = false;
    let discountAmount = 0;
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
          discountAmount = this.calculateDiscountAmountWithValidatedItems(
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
            amount: discountAmount,
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
      discountAmount = regularShippingCost;
      appliedDiscount.amount = regularShippingCost;
    }

    // Calculate tax (7% VAT)
    const taxAmount = Math.round((subtotal + shippingCost) * 0.07);

    // Calculate total
    const totalAmount = subtotal + shippingCost + taxAmount - discountAmount;

    return {
      subtotal,
      shippingCost,
      taxAmount,
      discountAmount,
      totalAmount,
      discount: appliedDiscount,
      freeGifts,
    };
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
}

export const cartDomain = new CartDomain();
