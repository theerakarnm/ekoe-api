import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { promotionSecurity } from '../features/promotions/promotion-security';
import { promotionAudit } from '../features/promotions/promotion-audit';
import { ResponseBuilder } from '../core/response';
import { requireAuth } from '../middleware/auth.middleware';
import { ValidationError } from '../core/errors';

const app = new Hono();

// Apply authentication middleware to all routes
app.use('*', requireAuth);

/**
 * Validate promotion calculations
 * POST /api/promotion-security/validate-calculations
 */
app.post(
  '/validate-calculations',
  zValidator('json', z.object({
    context: z.object({
      cartItems: z.array(z.object({
        productId: z.string(),
        variantId: z.string().optional(),
        quantity: z.number().int().positive(),
        unitPrice: z.number().int().positive(),
        subtotal: z.number().int().positive(),
        categoryIds: z.array(z.string()).optional(),
      })),
      cartSubtotal: z.number().int().positive(),
      customerId: z.string().optional(),
    }),
    appliedPromotion: z.object({
      promotionId: z.string(),
      promotionName: z.string(),
      discountAmount: z.number().int().min(0),
      freeGifts: z.array(z.object({
        productId: z.string().optional(),
        variantId: z.string().optional(),
        quantity: z.number().int().positive(),
        name: z.string(),
        imageUrl: z.string().optional(),
        value: z.number().int().min(0),
      })),
      appliedAt: z.string().datetime(),
    }),
    promotionId: z.string(),
  })),
  async (c) => {
    try {
      const { context, appliedPromotion, promotionId } = c.req.valid('json');
      
      // Get promotion details
      const { promotionRepository } = await import('../features/promotions/promotions.repository');
      const promotion = await promotionRepository.getPromotionById(promotionId);
      
      if (!promotion) {
        return ResponseBuilder.error(c, 'Promotion not found', 404);
      }

      // Convert string date to Date object
      const appliedPromotionWithDate = {
        ...appliedPromotion,
        appliedAt: new Date(appliedPromotion.appliedAt),
      };

      // Validate calculations
      await promotionSecurity.validatePromotionCalculations(
        context,
        appliedPromotionWithDate,
        promotion
      );

      return ResponseBuilder.success(c, {
        valid: true,
        message: 'Promotion calculations are valid',
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        return ResponseBuilder.error(c, error.message, 400, 'VALIDATION_ERROR');
      }
      throw error;
    }
  }
);

/**
 * Detect promotion abuse
 * POST /api/promotion-security/detect-abuse
 */
app.post(
  '/detect-abuse',
  zValidator('json', z.object({
    customerId: z.string(),
    promotionId: z.string(),
  })),
  async (c) => {
    try {
      const { customerId, promotionId } = c.req.valid('json');
      
      const abuseDetection = await promotionSecurity.detectPromotionAbuse(customerId, promotionId);

      return ResponseBuilder.success(c, abuseDetection);
    } catch (error) {
      throw error;
    }
  }
);

/**
 * Get audit logs
 * GET /api/promotion-security/audit-logs
 */
app.get(
  '/audit-logs',
  zValidator('query', z.object({
    page: z.string().transform(Number).optional(),
    limit: z.string().transform(Number).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    eventTypes: z.string().optional(), // Comma-separated list
    promotionIds: z.string().optional(), // Comma-separated list
    userIds: z.string().optional(), // Comma-separated list
    severity: z.string().optional(), // Comma-separated list
  })),
  async (c) => {
    try {
      const query = c.req.valid('query');
      
      const filter = {
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        eventTypes: query.eventTypes ? query.eventTypes.split(',') as any[] : undefined,
        promotionIds: query.promotionIds ? query.promotionIds.split(',') : undefined,
        userIds: query.userIds ? query.userIds.split(',') : undefined,
        severity: query.severity ? query.severity.split(',') as any[] : undefined,
      };

      const result = await promotionAudit.getAuditLogs(
        filter,
        query.page || 1,
        query.limit || 50
      );

      return ResponseBuilder.success(c, result);
    } catch (error) {
      throw error;
    }
  }
);

/**
 * Generate audit report summary
 * GET /api/promotion-security/audit-summary
 */
app.get(
  '/audit-summary',
  zValidator('query', z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    eventTypes: z.string().optional(),
    promotionIds: z.string().optional(),
  })),
  async (c) => {
    try {
      const query = c.req.valid('query');
      
      const filter = {
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        eventTypes: query.eventTypes ? query.eventTypes.split(',') as any[] : undefined,
        promotionIds: query.promotionIds ? query.promotionIds.split(',') : undefined,
      };

      const summary = await promotionAudit.generateAuditReportSummary(filter);

      return ResponseBuilder.success(c, summary);
    } catch (error) {
      throw error;
    }
  }
);

/**
 * Export audit logs to CSV
 * GET /api/promotion-security/audit-logs/export
 */
app.get(
  '/audit-logs/export',
  zValidator('query', z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    eventTypes: z.string().optional(),
    promotionIds: z.string().optional(),
    severity: z.string().optional(),
  })),
  async (c) => {
    try {
      const query = c.req.valid('query');
      
      const filter = {
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        eventTypes: query.eventTypes ? query.eventTypes.split(',') as any[] : undefined,
        promotionIds: query.promotionIds ? query.promotionIds.split(',') : undefined,
        severity: query.severity ? query.severity.split(',') as any[] : undefined,
      };

      const csvData = await promotionAudit.exportAuditLogsToCSV(filter);

      // Set CSV headers
      c.header('Content-Type', 'text/csv');
      c.header('Content-Disposition', `attachment; filename="promotion-audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);

      return c.text(csvData);
    } catch (error) {
      throw error;
    }
  }
);

/**
 * Get promotion audit trail
 * GET /api/promotion-security/promotions/:id/audit-trail
 */
app.get(
  '/promotions/:id/audit-trail',
  async (c) => {
    try {
      const promotionId = c.req.param('id');
      
      const auditTrail = await promotionAudit.getPromotionAuditTrail(promotionId);

      return ResponseBuilder.success(c, {
        promotionId,
        auditTrail,
        totalEvents: auditTrail.length,
      });
    } catch (error) {
      throw error;
    }
  }
);

/**
 * Get security events
 * GET /api/promotion-security/security-events
 */
app.get(
  '/security-events',
  zValidator('query', z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    severity: z.string().optional(), // Comma-separated list
  })),
  async (c) => {
    try {
      const query = c.req.valid('query');
      
      const securityEvents = await promotionAudit.getSecurityEvents(
        query.startDate ? new Date(query.startDate) : undefined,
        query.endDate ? new Date(query.endDate) : undefined,
        query.severity ? query.severity.split(',') as any[] : undefined
      );

      return ResponseBuilder.success(c, {
        events: securityEvents,
        totalEvents: securityEvents.length,
      });
    } catch (error) {
      throw error;
    }
  }
);

/**
 * Get user activity summary
 * GET /api/promotion-security/users/:userId/activity
 */
app.get(
  '/users/:userId/activity',
  zValidator('query', z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  })),
  async (c) => {
    try {
      const userId = c.req.param('userId');
      const query = c.req.valid('query');
      
      const activitySummary = await promotionAudit.getUserActivitySummary(
        userId,
        query.startDate ? new Date(query.startDate) : undefined,
        query.endDate ? new Date(query.endDate) : undefined
      );

      return ResponseBuilder.success(c, {
        userId,
        ...activitySummary,
      });
    } catch (error) {
      throw error;
    }
  }
);

/**
 * Check compliance violations
 * GET /api/promotion-security/compliance-violations
 */
app.get(
  '/compliance-violations',
  zValidator('query', z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  })),
  async (c) => {
    try {
      const query = c.req.valid('query');
      
      const violations = await promotionAudit.checkComplianceViolations(
        query.startDate ? new Date(query.startDate) : undefined,
        query.endDate ? new Date(query.endDate) : undefined
      );

      return ResponseBuilder.success(c, {
        violations,
        totalViolations: violations.length,
        criticalViolations: violations.filter(v => v.severity === 'critical').length,
        highViolations: violations.filter(v => v.severity === 'high').length,
      });
    } catch (error) {
      throw error;
    }
  }
);

export default app;