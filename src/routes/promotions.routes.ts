import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { promotionDomain } from '../features/promotions/promotions.domain';
import { promotionRepository } from '../features/promotions/promotions.repository';
import { ResponseBuilder } from '../core/response';
import logger from '../core/logger';
import { requireCustomerAuth, requireAdminAuth } from '../middleware/auth.middleware';
import { auth } from '../libs/auth';
import {
  createPromotionSchema,
  updatePromotionSchema,
  createPromotionRuleSchema,
  promotionEvaluationContextSchema
} from '../features/promotions/promotions.interface';

const promotions = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

// Apply authentication middleware to all routes
promotions.use('*', requireCustomerAuth);

/**
 * Get all promotions with pagination and filtering
 */
promotions.get('/', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const status = c.req.query('status');
    const type = c.req.query('type');
    const search = c.req.query('search');

    const result = await promotionRepository.getPromotions({
      page,
      limit,
      status,
      type,
      search
    });

    return ResponseBuilder.success(c, result);
  } catch (error) {
    logger.error({ error }, 'Failed to get promotions');
    return ResponseBuilder.error(c, 'Failed to get promotions', 500);
  }
});

/**
 * Get promotion by ID with rules
 */
promotions.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const promotion = await promotionRepository.getPromotionWithRules(id);

    if (!promotion) {
      return ResponseBuilder.error(c, 'Promotion not found', 404);
    }

    return ResponseBuilder.success(c, promotion);
  } catch (error) {
    logger.error({ error }, 'Failed to get promotion');
    return ResponseBuilder.error(c, 'Failed to get promotion', 500);
  }
});

/**
 * Create a new promotion (Admin only)
 */
promotions.post('/', requireAdminAuth, zValidator('json', createPromotionSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    const user = c.get('user');

    const promotion = await promotionDomain.createPromotion(data, user?.id);

    logger.info({
      promotionId: promotion.id,
      promotionName: promotion.name,
      createdBy: user?.id
    }, 'Promotion created');

    return ResponseBuilder.created(c, promotion);
  } catch (error) {
    logger.error({ error }, 'Failed to create promotion');
    return ResponseBuilder.error(c, (error as Error).message || 'Failed to create promotion', 400);
  }
});

/**
 * Update promotion (Admin only)
 */
promotions.put('/:id', requireAdminAuth, zValidator('json', updatePromotionSchema), async (c) => {
  try {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    const promotion = await promotionDomain.updatePromotion(id, data);

    logger.info({
      promotionId: promotion.id,
      promotionName: promotion.name,
      updatedBy: user?.id
    }, 'Promotion updated');

    return ResponseBuilder.success(c, promotion);
  } catch (error) {
    logger.error({ error }, 'Failed to update promotion');
    return ResponseBuilder.error(c, (error as Error).message || 'Failed to update promotion', 400);
  }
});

/**
 * Delete promotion (Admin only)
 */
promotions.delete('/:id', requireAdminAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');

    const success = await promotionRepository.deletePromotion(id);

    if (!success) {
      return ResponseBuilder.error(c, 'Promotion not found', 404);
    }

    logger.info({
      promotionId: id,
      deletedBy: user?.id
    }, 'Promotion deleted');

    return ResponseBuilder.noContent(c);
  } catch (error) {
    logger.error({ error }, 'Failed to delete promotion');
    return ResponseBuilder.error(c, 'Failed to delete promotion', 500);
  }
});

/**
 * Add rules to promotion (Admin only)
 */
promotions.post('/:id/rules', requireAdminAuth, zValidator('json', z.array(createPromotionRuleSchema)), async (c) => {
  try {
    const promotionId = c.req.param('id');
    const rules = c.req.valid('json');
    const user = c.get('user');

    const createdRules = await promotionDomain.addPromotionRules(promotionId, rules);

    logger.info({
      promotionId,
      ruleCount: createdRules.length,
      createdBy: user?.id
    }, 'Promotion rules added');

    return ResponseBuilder.created(c, createdRules);
  } catch (error) {
    logger.error({ error }, 'Failed to add promotion rules');
    return ResponseBuilder.error(c, (error as Error).message || 'Failed to add promotion rules', 400);
  }
});

/**
 * Evaluate promotions for a cart
 */
promotions.post('/evaluate', zValidator('json', promotionEvaluationContextSchema), async (c) => {
  try {
    const context = c.req.valid('json');
    const result = await promotionDomain.evaluatePromotions(context);

    return ResponseBuilder.success(c, result);
  } catch (error) {
    logger.error({ error }, 'Failed to evaluate promotions');
    return ResponseBuilder.error(c, 'Failed to evaluate promotions', 500);
  }
});

/**
 * Get promotion usage statistics (Admin only)
 */
promotions.get('/:id/stats', requireAdminAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const stats = await promotionRepository.getPromotionUsageStats(id);

    return ResponseBuilder.success(c, stats);
  } catch (error) {
    logger.error({ error }, 'Failed to get promotion stats');
    return ResponseBuilder.error(c, 'Failed to get promotion statistics', 500);
  }
});

// === SCHEDULING AND MONITORING ENDPOINTS ===

/**
 * Manually activate a promotion (Admin only)
 */
promotions.post('/:id/activate', requireAdminAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');

    await promotionDomain.activatePromotion(id);

    logger.info({
      promotionId: id,
      activatedBy: user?.id
    }, 'Promotion manually activated');

    return ResponseBuilder.success(c, { message: 'Promotion activated successfully' });
  } catch (error) {
    logger.error({ error }, 'Failed to activate promotion');
    return ResponseBuilder.error(c, (error as Error).message || 'Failed to activate promotion', 400);
  }
});

/**
 * Manually deactivate a promotion (Admin only)
 */
promotions.post('/:id/deactivate', requireAdminAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');

    await promotionDomain.deactivatePromotion(id);

    logger.info({
      promotionId: id,
      deactivatedBy: user?.id
    }, 'Promotion manually deactivated');

    return ResponseBuilder.success(c, { message: 'Promotion deactivated successfully' });
  } catch (error) {
    logger.error({ error }, 'Failed to deactivate promotion');
    return ResponseBuilder.error(c, (error as Error).message || 'Failed to deactivate promotion', 400);
  }
});

/**
 * Pause a promotion (Admin only)
 */
promotions.post('/:id/pause', requireAdminAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');

    await promotionDomain.pausePromotion(id);

    logger.info({
      promotionId: id,
      pausedBy: user?.id
    }, 'Promotion paused');

    return ResponseBuilder.success(c, { message: 'Promotion paused successfully' });
  } catch (error) {
    logger.error({ error }, 'Failed to pause promotion');
    return ResponseBuilder.error(c, (error as Error).message || 'Failed to pause promotion', 400);
  }
});

/**
 * Resume a paused promotion (Admin only)
 */
promotions.post('/:id/resume', requireAdminAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const user = c.get('user');

    await promotionDomain.resumePromotion(id);

    logger.info({
      promotionId: id,
      resumedBy: user?.id
    }, 'Promotion resumed');

    return ResponseBuilder.success(c, { message: 'Promotion resumed successfully' });
  } catch (error) {
    logger.error({ error }, 'Failed to resume promotion');
    return ResponseBuilder.error(c, (error as Error).message || 'Failed to resume promotion', 400);
  }
});

/**
 * Get promotion lifecycle events (Admin only)
 */
promotions.get('/:id/lifecycle', requireAdminAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const events = await promotionDomain.getPromotionLifecycleEvents(id);

    return ResponseBuilder.success(c, { events });
  } catch (error) {
    logger.error({ error }, 'Failed to get promotion lifecycle events');
    return ResponseBuilder.error(c, 'Failed to get promotion lifecycle events', 500);
  }
});

/**
 * Get real-time promotion status updates (Admin only)
 */
promotions.get('/monitoring/status-updates', requireAdminAuth, async (c) => {
  try {
    const updates = await promotionDomain.getPromotionStatusUpdates();

    return ResponseBuilder.success(c, { updates });
  } catch (error) {
    logger.error({ error }, 'Failed to get promotion status updates');
    return ResponseBuilder.error(c, 'Failed to get promotion status updates', 500);
  }
});

/**
 * Get promotion system health metrics (Admin only)
 */
promotions.get('/monitoring/health', requireAdminAuth, async (c) => {
  try {
    const metrics = await promotionDomain.getSystemHealthMetrics();

    return ResponseBuilder.success(c, metrics);
  } catch (error) {
    logger.error({ error }, 'Failed to get system health metrics');
    return ResponseBuilder.error(c, 'Failed to get system health metrics', 500);
  }
});

/**
 * Manually trigger scheduled promotion processing (Admin only)
 */
promotions.post('/monitoring/process-scheduled', requireAdminAuth, async (c) => {
  try {
    const user = c.get('user');

    await promotionDomain.processScheduledPromotions();

    logger.info({
      triggeredBy: user?.id
    }, 'Manual scheduled promotion processing triggered');

    return ResponseBuilder.success(c, { message: 'Scheduled promotions processed successfully' });
  } catch (error) {
    logger.error({ error }, 'Failed to process scheduled promotions');
    return ResponseBuilder.error(c, 'Failed to process scheduled promotions', 500);
  }
});

export { promotions };