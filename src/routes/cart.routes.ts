import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { cartDomain } from '../features/cart/cart.domain';
import { ResponseBuilder } from '../core/response';
import { logger } from '../core/logger';
import {
  validateCartSchema,
  calculateCartSchema,
  validateDiscountSchema,
} from '../features/cart/cart.interface';
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

    return c.json(ResponseBuilder.success(c, validatedCart));
  } catch (error) {
    logger.error({ error }, 'Failed to validate cart');
    throw error;
  }
});

/**
 * POST /api/cart/calculate
 * Calculate cart totals with discount and shipping
 */
cart.post('/calculate', zValidator('json', calculateCartSchema), async (c) => {
  try {
    const { items, discountCode, shippingMethod } = c.req.valid('json');

    const pricing = await cartDomain.calculateCartPricing(items, discountCode, shippingMethod);

    return c.json(ResponseBuilder.success(c, pricing));
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

    return c.json(ResponseBuilder.success(c, gifts));
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

    return c.json(ResponseBuilder.success(c, validation));
  } catch (error) {
    logger.error({ error }, 'Failed to validate discount code');
    throw error;
  }
});

export default cart;
