import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { promotionalCartService } from '../features/cart/promotional-cart.service';
import { ResponseBuilder } from '../core/response';
import { logger } from '../core/logger';
import { cartItemSchema } from '../features/cart/cart.interface';

const promotionalCart = new Hono();

// Extended cart item schema for promotional items
const promotionalCartItemSchema = cartItemSchema.extend({
  isPromotionalGift: z.boolean().optional(),
  sourcePromotionId: z.string().optional(),
  giftValue: z.number().optional(),
});

const evaluatePromotionalCartSchema = z.object({
  items: z.array(promotionalCartItemSchema).min(1, 'At least one item is required'),
  customerId: z.string().optional(),
  discountCode: z.string().optional(),
  shippingMethod: z.string().optional(),
});

const validatePromotionalCartSchema = z.object({
  items: z.array(promotionalCartItemSchema).min(1, 'At least one item is required'),
  customerId: z.string().optional(),
});

const removeGiftSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  variantId: z.string().optional(),
});

/**
 * Evaluate cart with automatic promotion application
 */
promotionalCart.post('/evaluate', zValidator('json', evaluatePromotionalCartSchema), async (c) => {
  try {
    const { items, customerId, discountCode, shippingMethod } = c.req.valid('json');

    logger.info({
      itemCount: items.length,
      customerId,
      hasDiscountCode: !!discountCode,
      shippingMethod,
    }, 'Evaluating promotional cart');

    const result = await promotionalCartService.evaluateCartWithPromotions(
      items,
      customerId,
      discountCode,
      shippingMethod
    );

    return ResponseBuilder.success(c, result);
  } catch (error) {
    logger.error({ error }, 'Failed to evaluate promotional cart');
    return ResponseBuilder.error(c, 'Failed to evaluate cart with promotions', 500);
  }
});

/**
 * Validate promotional cart and remove ineligible gifts
 */
promotionalCart.post('/validate', zValidator('json', validatePromotionalCartSchema), async (c) => {
  try {
    const { items, customerId } = c.req.valid('json');

    logger.info({
      itemCount: items.length,
      customerId,
    }, 'Validating promotional cart');

    const result = await promotionalCartService.validatePromotionalCart(items, customerId);

    return ResponseBuilder.success(c, result);
  } catch (error) {
    logger.error({ error }, 'Failed to validate promotional cart');
    return ResponseBuilder.error(c, 'Failed to validate promotional cart', 500);
  }
});

/**
 * Check if a gift item can be removed
 */
promotionalCart.post('/gift/can-remove', zValidator('json', removeGiftSchema), async (c) => {
  try {
    const { productId, variantId } = c.req.valid('json');

    const giftItem = {
      productId,
      variantId,
      quantity: 1, // Quantity doesn't matter for removal validation
      isPromotionalGift: true,
    };

    const result = promotionalCartService.validateGiftRemoval(giftItem);

    return ResponseBuilder.success(c, result);
  } catch (error) {
    logger.error({ error }, 'Failed to validate gift removal');
    return ResponseBuilder.error(c, 'Failed to validate gift removal', 500);
  }
});

/**
 * Get gift display information for cart items
 */
promotionalCart.post('/gift/display-info', zValidator('json', z.object({
  items: z.array(promotionalCartItemSchema),
})), async (c) => {
  try {
    const { items } = c.req.valid('json');

    const displayInfo = items.map(item => ({
      productId: item.productId,
      variantId: item.variantId,
      ...promotionalCartService.getGiftDisplayInfo(item),
    }));

    return ResponseBuilder.success(c, { items: displayInfo });
  } catch (error) {
    logger.error({ error }, 'Failed to get gift display info');
    return ResponseBuilder.error(c, 'Failed to get gift display information', 500);
  }
});

/**
 * Get promotional gift summary
 */
promotionalCart.post('/gift/summary', zValidator('json', z.object({
  items: z.array(promotionalCartItemSchema),
})), async (c) => {
  try {
    const { items } = c.req.valid('json');

    const summary = promotionalCartService.getPromotionalGiftSummary(items);

    // Convert Map to object for JSON serialization
    const giftsByPromotionObj = Object.fromEntries(summary.giftsByPromotion);

    return ResponseBuilder.success(c, {
      totalGifts: summary.totalGifts,
      totalGiftValue: summary.totalGiftValue,
      giftsByPromotion: giftsByPromotionObj,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get promotional gift summary');
    return ResponseBuilder.error(c, 'Failed to get promotional gift summary', 500);
  }
});

export { promotionalCart };