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

// === PUBLIC ENDPOINTS (No auth required) ===

/**
 * Get active promotions for public display
 */
promotions.get('/active', async (c) => {
  try {
    const activePromotions = await promotionRepository.getActivePromotions();

    // Get detailed promotions with rules
    const publicPromotions = await Promise.all(
      activePromotions.map(async (promotion) => {
        const detailedPromotion = await promotionRepository.getPromotionWithRules(promotion.id);
        return {
          id: promotion.id,
          name: promotion.name,
          description: promotion.description,
          type: promotion.type,
          startsAt: promotion.startsAt.toISOString(),
          endsAt: promotion.endsAt.toISOString(),
          priority: promotion.priority,
          rules: detailedPromotion?.rules || []
        };
      })
    );

    return ResponseBuilder.success(c, publicPromotions);
  } catch (error) {
    logger.error({ error }, 'Failed to get active promotions');
    return ResponseBuilder.error(c, 'Failed to get active promotions', 500);
  }
});

// Apply authentication middleware to authenticated routes
promotions.use('*', requireCustomerAuth);

// === ADMIN MANAGEMENT ENDPOINTS ===

/**
 * Get promotion dashboard summary (Admin only)
 */
promotions.get('/admin/dashboard', requireAdminAuth, async (c) => {
  try {
    const [activePromotions, scheduledPromotions, expiredPromotions] = await Promise.all([
      promotionRepository.getPromotions({ status: 'active', limit: 1000 }),
      promotionRepository.getPromotions({ status: 'scheduled', limit: 1000 }),
      promotionRepository.getPromotions({ status: 'expired', limit: 1000 })
    ]);

    const summary = {
      totalActive: activePromotions.total,
      totalScheduled: scheduledPromotions.total,
      totalExpired: expiredPromotions.total,
      recentPromotions: activePromotions.promotions.slice(0, 5),
      upcomingPromotions: scheduledPromotions.promotions
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
        .slice(0, 5)
    };

    return ResponseBuilder.success(c, summary);
  } catch (error) {
    logger.error({ error }, 'Failed to get promotion dashboard');
    return ResponseBuilder.error(c, 'Failed to get promotion dashboard', 500);
  }
});

/**
 * Bulk update promotion status (Admin only)
 */
promotions.patch('/admin/bulk-status', requireAdminAuth, zValidator('json', z.object({
  promotionIds: z.array(z.string()).min(1).max(50),
  status: z.enum(['active', 'paused', 'expired'])
})), async (c) => {
  try {
    const { promotionIds, status } = c.req.valid('json');
    const user = c.get('user');

    const results = [];
    for (const promotionId of promotionIds) {
      try {
        const success = await promotionRepository.updatePromotionStatus(promotionId, status);
        results.push({ promotionId, success, error: null });
      } catch (error) {
        results.push({
          promotionId,
          success: false,
          error: (error as Error).message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    logger.info({
      promotionIds,
      status,
      successCount,
      totalCount: promotionIds.length,
      updatedBy: user?.id
    }, 'Bulk promotion status update');

    return ResponseBuilder.success(c, {
      results,
      summary: {
        total: promotionIds.length,
        successful: successCount,
        failed: promotionIds.length - successCount
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed to bulk update promotion status');
    return ResponseBuilder.error(c, 'Failed to bulk update promotion status', 500);
  }
});

/**
 * Duplicate promotion (Admin only)
 */
promotions.post('/admin/:id/duplicate', requireAdminAuth, async (c) => {
  try {
    const sourceId = c.req.param('id');
    const user = c.get('user');

    const sourcePromotion = await promotionRepository.getPromotionWithRules(sourceId);
    if (!sourcePromotion) {
      return ResponseBuilder.error(c, 'Source promotion not found', 404);
    }

    // Create new promotion with modified name and future dates
    const now = new Date();
    const startDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
    const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days later

    const duplicateData = {
      name: `${sourcePromotion.name} (Copy)`,
      description: sourcePromotion.description,
      type: sourcePromotion.type,
      priority: sourcePromotion.priority,
      startsAt: startDate.toISOString(),
      endsAt: endDate.toISOString(),
      usageLimit: sourcePromotion.usageLimit,
      usageLimitPerCustomer: sourcePromotion.usageLimitPerCustomer,
      exclusiveWith: sourcePromotion.exclusiveWith
    };

    const newPromotion = await promotionDomain.createPromotion(duplicateData, user?.id);

    // Copy rules if they exist
    if (sourcePromotion.rules && sourcePromotion.rules.length > 0) {
      const rulesToCopy = sourcePromotion.rules.map(rule => ({
        ruleType: rule.ruleType,
        conditionType: rule.conditionType,
        operator: rule.operator,
        numericValue: rule.numericValue,
        textValue: rule.textValue,
        jsonValue: rule.jsonValue,
        benefitType: rule.benefitType,
        benefitValue: rule.benefitValue,
        maxDiscountAmount: rule.maxDiscountAmount,
        applicableProductIds: rule.applicableProductIds,
        applicableCategoryIds: rule.applicableCategoryIds,
        giftProductIds: rule.giftProductIds,
        giftQuantities: rule.giftQuantities
      }));

      await promotionDomain.addPromotionRules(newPromotion.id, rulesToCopy);
    }

    logger.info({
      sourcePromotionId: sourceId,
      newPromotionId: newPromotion.id,
      duplicatedBy: user?.id
    }, 'Promotion duplicated');

    return ResponseBuilder.created(c, newPromotion);
  } catch (error) {
    logger.error({ error }, 'Failed to duplicate promotion');
    return ResponseBuilder.error(c, (error as Error).message || 'Failed to duplicate promotion', 500);
  }
});

/**
 * Get promotion conflicts (Admin only)
 */
promotions.get('/admin/:id/conflicts', requireAdminAuth, async (c) => {
  try {
    const promotionId = c.req.param('id');

    const promotion = await promotionRepository.getPromotionById(promotionId);
    if (!promotion) {
      return ResponseBuilder.error(c, 'Promotion not found', 404);
    }

    // Get all active promotions in the same time period
    const activePromotions = await promotionRepository.getActivePromotions();
    const conflictingPromotions = [];

    for (const activePromotion of activePromotions) {
      if (activePromotion.id === promotionId) continue;

      // Check for time overlap
      const hasTimeOverlap = (
        (promotion.startsAt <= activePromotion.endsAt) &&
        (promotion.endsAt >= activePromotion.startsAt)
      );

      if (hasTimeOverlap) {
        // Check for exclusivity conflicts
        const exclusivityConflicts = await promotionRepository.checkPromotionConflicts(
          promotionId,
          [activePromotion.id]
        );

        conflictingPromotions.push({
          promotion: activePromotion,
          conflictTypes: {
            timeOverlap: hasTimeOverlap,
            exclusivity: exclusivityConflicts.length > 0,
            samePriority: activePromotion.priority === promotion.priority
          }
        });
      }
    }

    return ResponseBuilder.success(c, {
      promotionId,
      conflicts: conflictingPromotions,
      hasConflicts: conflictingPromotions.length > 0
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get promotion conflicts');
    return ResponseBuilder.error(c, 'Failed to get promotion conflicts', 500);
  }
});

/**
 * Get all promotions with pagination and filtering (Admin only)
 */
promotions.get('/', requireAdminAuth, async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100); // Cap at 100
    const status = c.req.query('status');
    const type = c.req.query('type');
    const search = c.req.query('search');
    const sortBy = c.req.query('sortBy') || 'createdAt';
    const sortOrder = c.req.query('sortOrder') || 'desc';

    // Validate pagination parameters
    if (page < 1) {
      return ResponseBuilder.error(c, 'Page must be greater than 0', 400);
    }

    if (limit < 1) {
      return ResponseBuilder.error(c, 'Limit must be greater than 0', 400);
    }

    const result = await promotionRepository.getPromotions({
      page,
      limit,
      status,
      type,
      search,
      sortBy,
      sortOrder
    });

    // Add pagination metadata
    const totalPages = Math.ceil(result.total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return ResponseBuilder.success(c, {
      promotions: result.promotions,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages,
        hasNextPage,
        hasPrevPage
      }
    });
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
    console.error(error);

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
    const rawRules = c.req.valid('json');
    const user = c.get('user');

    // Convert null values to undefined for type compatibility
    // Also convert monetary values to cents (satang) for storage
    const rules = rawRules.map(rule => ({
      ruleType: rule.ruleType,
      conditionType: rule.conditionType ?? undefined,
      operator: rule.operator ?? undefined,
      numericValue: rule.numericValue ?? undefined,
      textValue: rule.textValue ?? undefined,
      jsonValue: rule.jsonValue ?? undefined,
      benefitType: rule.benefitType ?? undefined,
      // Convert benefitValue to cents for fixed_discount types
      benefitValue: rule.benefitValue != null
        ? (rule.benefitType === 'fixed_discount' ? rule.benefitValue * 100 : rule.benefitValue)
        : undefined,
      maxDiscountAmount: rule.maxDiscountAmount != null ? rule.maxDiscountAmount * 100 : undefined,
      applicableProductIds: rule.applicableProductIds ?? undefined,
      applicableCategoryIds: rule.applicableCategoryIds ?? undefined,
      giftProductIds: rule.giftProductIds ?? undefined,
      giftQuantities: rule.giftQuantities ?? undefined,
      giftName: rule.giftName ?? undefined,
      giftPrice: rule.giftPrice != null ? rule.giftPrice * 100 : undefined,
      giftImageUrl: rule.giftImageUrl ?? undefined,
      giftQuantity: rule.giftQuantity ?? undefined,
      // Multiple gift options support
      giftOptions: rule.giftOptions ? rule.giftOptions.map(opt => ({
        ...opt,
        price: opt.price != null ? opt.price * 100 : undefined,  // Convert to cents
      })) : undefined,
      giftSelectionType: rule.giftSelectionType ?? undefined,
      maxGiftSelections: rule.maxGiftSelections ?? undefined,
    }));

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

// === ANALYTICS ENDPOINTS ===

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

/**
 * Get promotion analytics for date range (Admin only)
 */
promotions.get('/:id/analytics', requireAdminAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    // Validate date parameters
    if (startDate && isNaN(Date.parse(startDate))) {
      return ResponseBuilder.error(c, 'Invalid start date format', 400);
    }

    if (endDate && isNaN(Date.parse(endDate))) {
      return ResponseBuilder.error(c, 'Invalid end date format', 400);
    }

    const analytics = await promotionRepository.getPromotionAnalytics(id, startDate, endDate);

    // Calculate summary metrics
    const summary = analytics.reduce((acc, day) => ({
      totalViews: acc.totalViews + day.views,
      totalApplications: acc.totalApplications + day.applications,
      totalDiscountAmount: acc.totalDiscountAmount + day.totalDiscountAmount,
      totalOrders: acc.totalOrders + day.totalOrders,
      totalRevenue: acc.totalRevenue + day.totalRevenue,
    }), {
      totalViews: 0,
      totalApplications: 0,
      totalDiscountAmount: 0,
      totalOrders: 0,
      totalRevenue: 0,
    });

    const overallConversionRate = summary.totalViews > 0
      ? (summary.totalApplications / summary.totalViews) * 100
      : 0;

    const averageOrderValue = summary.totalOrders > 0
      ? summary.totalRevenue / summary.totalOrders
      : 0;

    const roi = summary.totalDiscountAmount > 0
      ? ((summary.totalRevenue - summary.totalDiscountAmount) / summary.totalDiscountAmount) * 100
      : 0;

    return ResponseBuilder.success(c, {
      analytics,
      summary: {
        ...summary,
        conversionRate: Math.round(overallConversionRate * 100) / 100,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100,
        roi: Math.round(roi * 100) / 100,
        dateRange: {
          startDate: startDate || analytics[analytics.length - 1]?.date,
          endDate: endDate || analytics[0]?.date,
          totalDays: analytics.length
        }
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get promotion analytics');
    return ResponseBuilder.error(c, 'Failed to get promotion analytics', 500);
  }
});

/**
 * Get promotion performance comparison (Admin only)
 */
promotions.get('/analytics/comparison', requireAdminAuth, async (c) => {
  try {
    const promotionIds = c.req.query('promotionIds')?.split(',') || [];
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    if (promotionIds.length === 0) {
      return ResponseBuilder.error(c, 'At least one promotion ID is required', 400);
    }

    if (promotionIds.length > 10) {
      return ResponseBuilder.error(c, 'Maximum 10 promotions can be compared', 400);
    }

    const comparisons = [];

    for (const promotionId of promotionIds) {
      const [promotion, analytics, stats] = await Promise.all([
        promotionRepository.getPromotionById(promotionId),
        promotionRepository.getPromotionAnalytics(promotionId, startDate, endDate),
        promotionRepository.getPromotionUsageStats(promotionId)
      ]);

      if (promotion) {
        const totalMetrics = analytics.reduce((acc, day) => ({
          views: acc.views + day.views,
          applications: acc.applications + day.applications,
          discountAmount: acc.discountAmount + day.totalDiscountAmount,
          orders: acc.orders + day.totalOrders,
          revenue: acc.revenue + day.totalRevenue,
        }), { views: 0, applications: 0, discountAmount: 0, orders: 0, revenue: 0 });

        comparisons.push({
          promotion: {
            id: promotion.id,
            name: promotion.name,
            type: promotion.type,
            status: promotion.status
          },
          metrics: {
            ...totalMetrics,
            conversionRate: totalMetrics.views > 0 ? (totalMetrics.applications / totalMetrics.views) * 100 : 0,
            averageOrderValue: totalMetrics.orders > 0 ? totalMetrics.revenue / totalMetrics.orders : 0,
            roi: totalMetrics.discountAmount > 0 ? ((totalMetrics.revenue - totalMetrics.discountAmount) / totalMetrics.discountAmount) * 100 : 0
          },
          overallStats: stats
        });
      }
    }

    return ResponseBuilder.success(c, {
      comparisons,
      dateRange: { startDate, endDate },
      totalPromotions: comparisons.length
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get promotion comparison');
    return ResponseBuilder.error(c, 'Failed to get promotion comparison', 500);
  }
});

/**
 * Export promotion analytics as CSV (Admin only)
 */
promotions.get('/:id/analytics/export', requireAdminAuth, async (c) => {
  try {
    const id = c.req.param('id');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const format = c.req.query('format') || 'csv';

    if (format !== 'csv') {
      return ResponseBuilder.error(c, 'Only CSV format is supported', 400);
    }

    const [promotion, analytics] = await Promise.all([
      promotionRepository.getPromotionById(id),
      promotionRepository.getPromotionAnalytics(id, startDate, endDate)
    ]);

    if (!promotion) {
      return ResponseBuilder.error(c, 'Promotion not found', 404);
    }

    // Generate CSV content
    const csvHeaders = [
      'Date',
      'Views',
      'Applications',
      'Conversion Rate (%)',
      'Total Discount Amount',
      'Total Orders',
      'Total Revenue',
      'Average Order Value',
      'ROI (%)'
    ].join(',');

    const csvRows = analytics.map(day => {
      const conversionRate = day.views > 0 ? (day.applications / day.views) * 100 : 0;
      const avgOrderValue = day.totalOrders > 0 ? day.totalRevenue / day.totalOrders : 0;
      const roi = day.totalDiscountAmount > 0 ? ((day.totalRevenue - day.totalDiscountAmount) / day.totalDiscountAmount) * 100 : 0;

      return [
        day.date,
        day.views,
        day.applications,
        Math.round(conversionRate * 100) / 100,
        day.totalDiscountAmount,
        day.totalOrders,
        day.totalRevenue,
        Math.round(avgOrderValue * 100) / 100,
        Math.round(roi * 100) / 100
      ].join(',');
    });

    const csvContent = [csvHeaders, ...csvRows].join('\n');

    // Set CSV headers
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="promotion-${id}-analytics.csv"`);

    return c.text(csvContent);
  } catch (error) {
    logger.error({ error }, 'Failed to export promotion analytics');
    return ResponseBuilder.error(c, 'Failed to export promotion analytics', 500);
  }
});

/**
 * Get overall promotion system analytics (Admin only)
 */
promotions.get('/analytics/overview', requireAdminAuth, async (c) => {
  try {
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    // Get all promotions for the period
    const allPromotions = await promotionRepository.getPromotions({ limit: 1000 });

    const systemMetrics = {
      totalPromotions: allPromotions.total,
      activePromotions: 0,
      scheduledPromotions: 0,
      expiredPromotions: 0,
      totalUsage: 0,
      totalDiscountGiven: 0,
      totalRevenueGenerated: 0,
      averageConversionRate: 0,
      topPerformingPromotions: [] as any[]
    };

    // Calculate metrics for each promotion type
    const promotionPerformance = [];

    for (const promotion of allPromotions.promotions) {
      // Count by status
      switch (promotion.status) {
        case 'active':
          systemMetrics.activePromotions++;
          break;
        case 'scheduled':
          systemMetrics.scheduledPromotions++;
          break;
        case 'expired':
          systemMetrics.expiredPromotions++;
          break;
      }

      // Get performance metrics
      const [analytics, stats] = await Promise.all([
        promotionRepository.getPromotionAnalytics(promotion.id, startDate, endDate),
        promotionRepository.getPromotionUsageStats(promotion.id)
      ]);

      const totalMetrics = analytics.reduce((acc, day) => ({
        views: acc.views + day.views,
        applications: acc.applications + day.applications,
        discountAmount: acc.discountAmount + day.totalDiscountAmount,
        revenue: acc.revenue + day.totalRevenue,
      }), { views: 0, applications: 0, discountAmount: 0, revenue: 0 });

      systemMetrics.totalUsage += stats.totalUsage;
      systemMetrics.totalDiscountGiven += stats.totalDiscount;
      systemMetrics.totalRevenueGenerated += stats.totalRevenue;

      if (totalMetrics.views > 0) {
        const conversionRate = (totalMetrics.applications / totalMetrics.views) * 100;
        promotionPerformance.push({
          promotion: {
            id: promotion.id,
            name: promotion.name,
            type: promotion.type
          },
          conversionRate,
          totalRevenue: totalMetrics.revenue,
          totalDiscount: totalMetrics.discountAmount,
          usage: stats.totalUsage
        });
      }
    }

    // Calculate average conversion rate
    const validConversions = promotionPerformance.filter(p => p.conversionRate > 0);
    systemMetrics.averageConversionRate = validConversions.length > 0
      ? validConversions.reduce((sum, p) => sum + p.conversionRate, 0) / validConversions.length
      : 0;

    // Get top performing promotions
    systemMetrics.topPerformingPromotions = promotionPerformance
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10);

    return ResponseBuilder.success(c, {
      systemMetrics: {
        ...systemMetrics,
        averageConversionRate: Math.round(systemMetrics.averageConversionRate * 100) / 100,
        roi: systemMetrics.totalDiscountGiven > 0
          ? Math.round(((systemMetrics.totalRevenueGenerated - systemMetrics.totalDiscountGiven) / systemMetrics.totalDiscountGiven) * 100 * 100) / 100
          : 0
      },
      dateRange: { startDate, endDate },
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get system analytics overview');
    return ResponseBuilder.error(c, 'Failed to get system analytics overview', 500);
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