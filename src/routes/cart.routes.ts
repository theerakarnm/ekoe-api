import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { cartDomain } from '../features/cart/cart.domain';
import { ResponseBuilder } from '../core/response';
import { logger } from '../core/logger';
import {
  validateCartSchema,
  calculateCartSchema,
  validateDiscountSchema,
  cartItemSchema,
} from '../features/cart/cart.interface';
import { z } from 'zod';
import { auth } from '../libs/auth';
import { cartValidationRateLimit, discountValidationRateLimit } from '../middleware/rate-limit.middleware';

const cart = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

/**
 * POST /api/cart/validate
 * Validate cart items and return accurate pricing
 */
cart.post('/validate', cartValidationRateLimit, zValidator('json', validateCartSchema), async (c) => {
  try {
    const { items } = c.req.valid('json');

    const validatedCart = await cartDomain.validateCart(items);

    return ResponseBuilder.success(c, validatedCart);
  } catch (error) {
    logger.error({ error }, 'Failed to validate cart');
    throw error;
  }
});

/**
 * POST /api/cart/calculate
 * Calculate cart totals with discount, shipping, and promotions
 */
cart.post('/calculate', zValidator('json', calculateCartSchema), async (c) => {
  try {
    const { items, discountCode, shippingMethod } = c.req.valid('json');
    
    // Get user ID from session if available for promotion evaluation
    const customerId = c.var.user?.id;

    const pricing = await cartDomain.calculateCartPricing(items, discountCode, shippingMethod, customerId);

    return ResponseBuilder.success(c, pricing);
  } catch (error) {
    logger.error({ error }, 'Failed to calculate cart pricing');
    throw error;
  }
});

/**
 * GET /api/cart/gifts
 * Get eligible free gifts for cart
 */
cart.get('/gifts', async (c) => {
  try {
    const subtotal = Number(c.req.query('subtotal') || 0);
    const productIdsParam = c.req.query('productIds');
    const productIds = productIdsParam ? productIdsParam.split(',') : [];

    const items = productIds.map(id => ({ productId: id, quantity: 1 }));
    const gifts = await cartDomain.getEligibleFreeGifts(items, subtotal);

    return ResponseBuilder.success(c, gifts);
  } catch (error) {
    logger.error({ error }, 'Failed to get eligible gifts');
    throw error;
  }
});

/**
 * POST /api/cart/discount/validate
 * Validate discount code
 */
cart.post('/discount/validate', discountValidationRateLimit, zValidator('json', validateDiscountSchema), async (c) => {
  try {
    const { code, subtotal, items } = c.req.valid('json');

    // Get user ID from session if available
    const userId = c.var.user?.id

    const validation = await cartDomain.validateDiscountCode(code, subtotal, items, userId);


    return ResponseBuilder.success(c, validation);
  } catch (error) {
    logger.error({ error }, 'Failed to validate discount code');
    throw error;
  }
});

/**
 * POST /api/cart/promotions/evaluate
 * Evaluate promotions for cart items
 */
cart.post('/promotions/evaluate', zValidator('json', validateCartSchema), async (c) => {
  try {
    const { items } = c.req.valid('json');
    const customerId = c.var.user?.id;

    // Validate cart first
    const validatedCart = await cartDomain.validateCart(items);
    
    if (!validatedCart.isValid) {
      return ResponseBuilder.success(c, {
        eligiblePromotions: [],
        totalDiscount: 0,
        freeGifts: [],
        errors: validatedCart.errors,
      });
    }

    // Evaluate promotions
    const promotionResult = await cartDomain.evaluatePromotions(validatedCart, customerId);

    return ResponseBuilder.success(c, promotionResult);
  } catch (error) {
    logger.error({ error }, 'Failed to evaluate promotions');
    throw error;
  }
});

/**
 * POST /api/cart/promotions/re-evaluate
 * Re-evaluate promotions when cart changes
 */
cart.post('/promotions/re-evaluate', zValidator('json', validateCartSchema), async (c) => {
  try {
    const { items } = c.req.valid('json');
    const customerId = c.var.user?.id;

    // Get current promotions from request body if provided
    const currentPromotions = c.req.query('currentPromotions') 
      ? JSON.parse(c.req.query('currentPromotions') as string) 
      : undefined;

    const promotionResult = await cartDomain.reEvaluatePromotions(items, customerId, currentPromotions);

    return ResponseBuilder.success(c, promotionResult);
  } catch (error) {
    logger.error({ error }, 'Failed to re-evaluate promotions');
    throw error;
  }
});

/**
 * POST /api/cart/calculate-with-messages
 * Calculate cart totals with promotion messages for customer communication
 */
cart.post('/calculate-with-messages', zValidator('json', calculateCartSchema), async (c) => {
  try {
    const { items, discountCode, shippingMethod } = c.req.valid('json');
    const customerId = c.var.user?.id;

    const pricing = await cartDomain.calculateCartPricingWithMessages(items, customerId, discountCode, shippingMethod);

    return ResponseBuilder.success(c, pricing);
  } catch (error) {
    logger.error({ error }, 'Failed to calculate cart pricing with messages');
    throw error;
  }
});

/**
 * POST /api/cart/validate-with-promotion-removal
 * Validate cart and automatically remove ineligible promotions
 */
cart.post('/validate-with-promotion-removal', zValidator('json', z.object({
  items: z.array(cartItemSchema).min(1, 'At least one item is required'),
  currentPromotions: z.array(z.any()).default([]),
})), async (c) => {
  try {
    const { items, currentPromotions } = c.req.valid('json');
    const customerId = c.var.user?.id;

    const result = await cartDomain.validateCartWithPromotionRemoval(items, currentPromotions, customerId);

    return ResponseBuilder.success(c, result);
  } catch (error) {
    logger.error({ error }, 'Failed to validate cart with promotion removal');
    throw error;
  }
});

/**
 * POST /api/cart/handle-quantity-change
 * Handle cart quantity changes with promotion re-evaluation
 */
cart.post('/handle-quantity-change', zValidator('json', z.object({
  items: z.array(cartItemSchema).min(1, 'At least one item is required'),
  changedItem: z.object({
    productId: z.string(),
    variantId: z.string().optional(),
    oldQuantity: z.number().int().min(0),
    newQuantity: z.number().int().min(0),
  }),
  currentPromotions: z.array(z.any()).default([]),
})), async (c) => {
  try {
    const { items, changedItem, currentPromotions } = c.req.valid('json');
    const customerId = c.var.user?.id;

    const result = await cartDomain.handleCartQuantityChange(items, changedItem, currentPromotions, customerId);

    return ResponseBuilder.success(c, result);
  } catch (error) {
    logger.error({ error }, 'Failed to handle cart quantity change');
    throw error;
  }
});

/**
 * POST /api/cart/resolve-promotion-conflicts
 * Resolve promotion conflicts during cart updates
 */
cart.post('/resolve-promotion-conflicts', zValidator('json', z.object({
  items: z.array(cartItemSchema).min(1, 'At least one item is required'),
  conflictingPromotions: z.array(z.any()).min(1, 'At least one conflicting promotion is required'),
})), async (c) => {
  try {
    const { items, conflictingPromotions } = c.req.valid('json');
    const customerId = c.var.user?.id;

    const result = await cartDomain.resolvePromotionConflicts(items, conflictingPromotions, customerId);

    return ResponseBuilder.success(c, result);
  } catch (error) {
    logger.error({ error }, 'Failed to resolve promotion conflicts');
    throw error;
  }
});

export default cart;
