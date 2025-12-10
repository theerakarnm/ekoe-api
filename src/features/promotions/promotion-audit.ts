import { db } from '../../core/database';
import { autoPromotionAuditLogs } from '../../core/database/schema/promotional-system.schema';
import { promotionRepository } from './promotions.repository';
import { eq, and, gte, lte, inArray, desc, sql } from 'drizzle-orm';
import { 
  ValidationError, 
  NotFoundError 
} from '../../core/errors';
import type {
  Promotion,
  PromotionRule,
  AppliedPromotion
} from './promotions.interface';

/**
 * Audit trail system for promotions
 * Implements comprehensive promotion change logging, user action tracking,
 * and audit report generation for compliance
 */

// Audit event types
export type AuditEventType = 
  | 'promotion_created'
  | 'promotion_updated' 
  | 'promotion_deleted'
  | 'promotion_activated'
  | 'promotion_deactivated'
  | 'promotion_paused'
  | 'promotion_resumed'
  | 'promotion_applied'
  | 'promotion_usage_recorded'
  | 'rule_created'
  | 'rule_updated'
  | 'rule_deleted'
  | 'security_violation'
  | 'suspicious_activity'
  | 'high_value_promotion_applied'
  | 'usage_limit_exceeded'
  | 'calculation_validation_failed';

// Audit log entry interface
export interface PromotionAuditLog {
  id: string;
  eventType: AuditEventType;
  promotionId?: string;
  userId?: string;
  customerId?: string;
  entityType: 'promotion' | 'promotion_rule' | 'promotion_usage' | 'security_event';
  entityId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  timestamp: Date;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

// Audit report interfaces
export interface AuditReportFilter {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: AuditEventType[];
  promotionIds?: string[];
  userIds?: string[];
  severity?: ('info' | 'warning' | 'error' | 'critical')[];
  entityTypes?: ('promotion' | 'promotion_rule' | 'promotion_usage' | 'security_event')[];
}

export interface AuditReportSummary {
  totalEvents: number;
  eventsByType: Record<AuditEventType, number>;
  eventsBySeverity: Record<string, number>;
  topUsers: Array<{ userId: string; eventCount: number }>;
  topPromotions: Array<{ promotionId: string; promotionName: string; eventCount: number }>;
  securityEvents: number;
  suspiciousActivities: number;
  dateRange: { startDate: Date; endDate: Date };
}

export class PromotionAudit {
  /**
   * Log promotion creation event
   */
  async logPromotionCreated(
    promotion: Promotion,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.createAuditLog({
      eventType: 'promotion_created',
      promotionId: promotion.id,
      userId,
      entityType: 'promotion',
      entityId: promotion.id,
      newValues: {
        name: promotion.name,
        type: promotion.type,
        status: promotion.status,
        startsAt: promotion.startsAt,
        endsAt: promotion.endsAt,
        priority: promotion.priority,
        usageLimit: promotion.usageLimit,
        usageLimitPerCustomer: promotion.usageLimitPerCustomer
      },
      metadata,
      severity: 'info'
    });
  }

  /**
   * Log promotion update event
   */
  async logPromotionUpdated(
    promotionId: string,
    oldValues: Partial<Promotion>,
    newValues: Partial<Promotion>,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    // Filter out unchanged values
    const changedFields: Record<string, any> = {};
    const oldChangedFields: Record<string, any> = {};

    for (const [key, newValue] of Object.entries(newValues)) {
      const oldValue = oldValues[key as keyof Promotion];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changedFields[key] = newValue;
        oldChangedFields[key] = oldValue;
      }
    }

    if (Object.keys(changedFields).length === 0) {
      return; // No actual changes to log
    }

    await this.createAuditLog({
      eventType: 'promotion_updated',
      promotionId,
      userId,
      entityType: 'promotion',
      entityId: promotionId,
      oldValues: oldChangedFields,
      newValues: changedFields,
      metadata: {
        ...metadata,
        changedFieldCount: Object.keys(changedFields).length,
        changedFields: Object.keys(changedFields)
      },
      severity: 'info'
    });
  }

  /**
   * Log promotion deletion event
   */
  async logPromotionDeleted(
    promotion: Promotion,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.createAuditLog({
      eventType: 'promotion_deleted',
      promotionId: promotion.id,
      userId,
      entityType: 'promotion',
      entityId: promotion.id,
      oldValues: {
        name: promotion.name,
        type: promotion.type,
        status: promotion.status,
        currentUsageCount: promotion.currentUsageCount
      },
      metadata: {
        ...metadata,
        deletedAt: new Date()
      },
      severity: 'warning'
    });
  }

  /**
   * Log promotion status change events
   */
  async logPromotionStatusChange(
    promotionId: string,
    oldStatus: string,
    newStatus: string,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const eventTypeMap: Record<string, AuditEventType> = {
      'active': 'promotion_activated',
      'paused': 'promotion_paused',
      'expired': 'promotion_deactivated',
      'draft': 'promotion_deactivated'
    };

    const eventType = eventTypeMap[newStatus] || 'promotion_updated';

    await this.createAuditLog({
      eventType,
      promotionId,
      userId,
      entityType: 'promotion',
      entityId: promotionId,
      oldValues: { status: oldStatus },
      newValues: { status: newStatus },
      metadata: {
        ...metadata,
        statusChangeReason: metadata?.reason || 'Manual change'
      },
      severity: newStatus === 'active' ? 'info' : 'warning'
    });
  }

  /**
   * Log promotion rule creation
   */
  async logPromotionRuleCreated(
    rule: PromotionRule,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.createAuditLog({
      eventType: 'rule_created',
      promotionId: rule.promotionId,
      userId,
      entityType: 'promotion_rule',
      entityId: rule.id,
      newValues: {
        ruleType: rule.ruleType,
        conditionType: rule.conditionType,
        benefitType: rule.benefitType,
        benefitValue: rule.benefitValue,
        numericValue: rule.numericValue
      },
      metadata,
      severity: 'info'
    });
  }

  /**
   * Log promotion rule deletion
   */
  async logPromotionRuleDeleted(
    rule: PromotionRule,
    userId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.createAuditLog({
      eventType: 'rule_deleted',
      promotionId: rule.promotionId,
      userId,
      entityType: 'promotion_rule',
      entityId: rule.id,
      oldValues: {
        ruleType: rule.ruleType,
        conditionType: rule.conditionType,
        benefitType: rule.benefitType,
        benefitValue: rule.benefitValue
      },
      metadata,
      severity: 'warning'
    });
  }

  /**
   * Log promotion application event
   */
  async logPromotionApplied(
    appliedPromotion: AppliedPromotion,
    customerId?: string,
    cartSubtotal?: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    const severity = appliedPromotion.discountAmount > 500000 ? 'warning' : 'info'; // High-value promotions get warning level

    await this.createAuditLog({
      eventType: 'promotion_applied',
      promotionId: appliedPromotion.promotionId,
      customerId,
      entityType: 'promotion_usage',
      newValues: {
        discountAmount: appliedPromotion.discountAmount,
        freeGiftCount: appliedPromotion.freeGifts.length,
        cartSubtotal
      },
      metadata: {
        ...metadata,
        promotionName: appliedPromotion.promotionName,
        appliedAt: appliedPromotion.appliedAt,
        freeGifts: appliedPromotion.freeGifts.map(g => ({
          productId: g.productId,
          quantity: g.quantity,
          name: g.name
        }))
      },
      severity
    });
  }

  /**
   * Log promotion usage recording (when order is completed)
   */
  async logPromotionUsageRecorded(
    promotionId: string,
    orderId: string,
    customerId?: string,
    discountAmount?: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.createAuditLog({
      eventType: 'promotion_usage_recorded',
      promotionId,
      customerId,
      entityType: 'promotion_usage',
      newValues: {
        orderId,
        discountAmount,
        recordedAt: new Date()
      },
      metadata,
      severity: 'info'
    });
  }

  /**
   * Log security violation events
   */
  async logSecurityViolation(
    eventType: AuditEventType,
    promotionId?: string,
    customerId?: string,
    violationDetails?: Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.createAuditLog({
      eventType,
      promotionId,
      customerId,
      entityType: 'security_event',
      metadata: {
        ...metadata,
        violationDetails,
        detectedAt: new Date()
      },
      severity: 'error'
    });
  }

  /**
   * Log suspicious activity
   */
  async logSuspiciousActivity(
    promotionId: string,
    customerId?: string,
    activityDetails?: Record<string, any>,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.createAuditLog({
      eventType: 'suspicious_activity',
      promotionId,
      customerId,
      entityType: 'security_event',
      metadata: {
        ...metadata,
        activityDetails,
        detectedAt: new Date(),
        riskLevel: this.calculateRiskLevel(activityDetails)
      },
      severity: 'warning'
    });
  }

  /**
   * Log high-value promotion application
   */
  async logHighValuePromotionApplied(
    promotionId: string,
    customerId?: string,
    discountAmount?: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.createAuditLog({
      eventType: 'high_value_promotion_applied',
      promotionId,
      customerId,
      entityType: 'security_event',
      newValues: {
        discountAmount,
        threshold: 500000 // 5,000 THB threshold
      },
      metadata: {
        ...metadata,
        requiresReview: discountAmount && discountAmount > 2000000, // 20,000 THB
        appliedAt: new Date()
      },
      severity: 'warning'
    });
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async getAuditLogs(
    filter: AuditReportFilter = {},
    page: number = 1,
    limit: number = 50
  ): Promise<{
    logs: PromotionAuditLog[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;
    let whereConditions: any[] = [];

    // Apply filters
    if (filter.startDate) {
      whereConditions.push(gte(autoPromotionAuditLogs.timestamp, filter.startDate));
    }

    if (filter.endDate) {
      whereConditions.push(lte(autoPromotionAuditLogs.timestamp, filter.endDate));
    }

    if (filter.eventTypes && filter.eventTypes.length > 0) {
      whereConditions.push(inArray(autoPromotionAuditLogs.eventType, filter.eventTypes));
    }

    if (filter.promotionIds && filter.promotionIds.length > 0) {
      whereConditions.push(inArray(autoPromotionAuditLogs.promotionId, filter.promotionIds));
    }

    if (filter.userIds && filter.userIds.length > 0) {
      whereConditions.push(inArray(autoPromotionAuditLogs.userId, filter.userIds));
    }

    if (filter.severity && filter.severity.length > 0) {
      whereConditions.push(inArray(autoPromotionAuditLogs.severity, filter.severity));
    }

    if (filter.entityTypes && filter.entityTypes.length > 0) {
      whereConditions.push(inArray(autoPromotionAuditLogs.entityType, filter.entityTypes));
    }

    // Get logs with pagination
    const [logs, totalResult] = await Promise.all([
      db
        .select()
        .from(autoPromotionAuditLogs)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
        .orderBy(desc(autoPromotionAuditLogs.timestamp))
        .limit(limit)
        .offset(offset),

      db
        .select({ count: sql<number>`count(*)` })
        .from(autoPromotionAuditLogs)
        .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
    ]);

    const total = Number(totalResult[0]?.count || 0);
    const totalPages = Math.ceil(total / limit);

    return {
      logs: logs.map(log => this.mapAuditLogFromDb(log)),
      total,
      page,
      totalPages,
    };
  }

  /**
   * Generate audit report summary
   */
  async generateAuditReportSummary(filter: AuditReportFilter = {}): Promise<AuditReportSummary> {
    const startDate = filter.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const endDate = filter.endDate || new Date();

    // This would query the audit logs table and generate statistics
    // For now, return placeholder data
    return {
      totalEvents: 0,
      eventsByType: {} as Record<AuditEventType, number>,
      eventsBySeverity: {
        info: 0,
        warning: 0,
        error: 0,
        critical: 0
      },
      topUsers: [],
      topPromotions: [],
      securityEvents: 0,
      suspiciousActivities: 0,
      dateRange: { startDate, endDate }
    };
  }

  /**
   * Export audit logs to CSV format
   */
  async exportAuditLogsToCSV(filter: AuditReportFilter = {}): Promise<string> {
    const { logs } = await this.getAuditLogs(filter, 1, 10000); // Get all logs for export

    const headers = [
      'Timestamp',
      'Event Type',
      'Promotion ID',
      'User ID',
      'Customer ID',
      'Entity Type',
      'Entity ID',
      'Severity',
      'Old Values',
      'New Values',
      'Metadata',
      'IP Address'
    ];

    const csvRows = [headers.join(',')];

    for (const log of logs) {
      const row = [
        log.timestamp.toISOString(),
        log.eventType,
        log.promotionId || '',
        log.userId || '',
        log.customerId || '',
        log.entityType,
        log.entityId || '',
        log.severity,
        JSON.stringify(log.oldValues || {}),
        JSON.stringify(log.newValues || {}),
        JSON.stringify(log.metadata || {}),
        log.ipAddress || ''
      ];

      csvRows.push(row.map(field => `"${field.replace(/"/g, '""')}"`).join(','));
    }

    return csvRows.join('\n');
  }

  /**
   * Get audit trail for specific promotion
   */
  async getPromotionAuditTrail(promotionId: string): Promise<PromotionAuditLog[]> {
    const filter: AuditReportFilter = {
      promotionIds: [promotionId]
    };

    const { logs } = await this.getAuditLogs(filter, 1, 1000);
    return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get security events for monitoring
   */
  async getSecurityEvents(
    startDate?: Date,
    endDate?: Date,
    severity?: ('warning' | 'error' | 'critical')[]
  ): Promise<PromotionAuditLog[]> {
    const filter: AuditReportFilter = {
      startDate,
      endDate,
      eventTypes: ['security_violation', 'suspicious_activity', 'high_value_promotion_applied'],
      severity
    };

    const { logs } = await this.getAuditLogs(filter, 1, 1000);
    return logs;
  }

  /**
   * Get user activity summary
   */
  async getUserActivitySummary(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalActions: number;
    actionsByType: Record<AuditEventType, number>;
    promotionsModified: string[];
    lastActivity: Date;
  }> {
    const filter: AuditReportFilter = {
      userIds: [userId],
      startDate,
      endDate
    };

    const { logs } = await this.getAuditLogs(filter, 1, 1000);

    const actionsByType: Record<AuditEventType, number> = {} as any;
    const promotionsModified = new Set<string>();
    let lastActivity = new Date(0);

    for (const log of logs) {
      actionsByType[log.eventType] = (actionsByType[log.eventType] || 0) + 1;
      
      if (log.promotionId) {
        promotionsModified.add(log.promotionId);
      }
      
      if (log.timestamp > lastActivity) {
        lastActivity = log.timestamp;
      }
    }

    return {
      totalActions: logs.length,
      actionsByType,
      promotionsModified: Array.from(promotionsModified),
      lastActivity
    };
  }

  /**
   * Check for compliance violations
   */
  async checkComplianceViolations(
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    count: number;
    examples: PromotionAuditLog[];
  }>> {
    const violations: Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      count: number;
      examples: PromotionAuditLog[];
    }> = [];

    // Check for excessive high-value promotions
    const highValueEvents = await this.getSecurityEvents(startDate, endDate, ['warning', 'error']);
    const highValueCount = highValueEvents.filter(e => e.eventType === 'high_value_promotion_applied').length;
    
    if (highValueCount > 100) { // More than 100 high-value promotions
      violations.push({
        type: 'excessive_high_value_promotions',
        description: 'Excessive number of high-value promotions applied',
        severity: 'medium',
        count: highValueCount,
        examples: highValueEvents.slice(0, 5)
      });
    }

    // Check for security violations
    const securityViolations = highValueEvents.filter(e => e.eventType === 'security_violation');
    if (securityViolations.length > 0) {
      violations.push({
        type: 'security_violations',
        description: 'Security violations detected in promotion system',
        severity: 'high',
        count: securityViolations.length,
        examples: securityViolations.slice(0, 5)
      });
    }

    // Check for suspicious activities
    const suspiciousActivities = highValueEvents.filter(e => e.eventType === 'suspicious_activity');
    if (suspiciousActivities.length > 10) {
      violations.push({
        type: 'suspicious_activities',
        description: 'Multiple suspicious activities detected',
        severity: 'medium',
        count: suspiciousActivities.length,
        examples: suspiciousActivities.slice(0, 5)
      });
    }

    return violations;
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(logData: Omit<PromotionAuditLog, 'id' | 'timestamp'>): Promise<void> {
    try {
      await db.insert(autoPromotionAuditLogs).values({
        eventType: logData.eventType,
        promotionId: logData.promotionId,
        userId: logData.userId,
        customerId: logData.customerId,
        entityType: logData.entityType,
        entityId: logData.entityId,
        oldValues: logData.oldValues ? JSON.stringify(logData.oldValues) : null,
        newValues: logData.newValues ? JSON.stringify(logData.newValues) : null,
        metadata: logData.metadata ? JSON.stringify(logData.metadata) : null,
        ipAddress: logData.ipAddress,
        userAgent: logData.userAgent,
        sessionId: logData.sessionId,
        severity: logData.severity,
      });

      // Also log to console for immediate visibility during development
      console.log('AUDIT LOG CREATED:', {
        eventType: logData.eventType,
        promotionId: logData.promotionId,
        severity: logData.severity,
        timestamp: new Date()
      });
    } catch (error) {
      // Don't let audit logging failures break the main flow
      console.error('Failed to create audit log:', error);
    }
  }

  /**
   * Generate unique audit ID
   */
  private generateAuditId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate risk level for suspicious activities
   */
  private calculateRiskLevel(activityDetails?: Record<string, any>): 'low' | 'medium' | 'high' | 'critical' {
    if (!activityDetails) return 'low';

    let riskScore = 0;

    // High discount amounts increase risk
    if (activityDetails.discountAmount > 1000000) riskScore += 3; // 10,000 THB
    else if (activityDetails.discountAmount > 500000) riskScore += 2; // 5,000 THB
    else if (activityDetails.discountAmount > 100000) riskScore += 1; // 1,000 THB

    // Multiple attempts increase risk
    if (activityDetails.attemptCount > 10) riskScore += 3;
    else if (activityDetails.attemptCount > 5) riskScore += 2;
    else if (activityDetails.attemptCount > 2) riskScore += 1;

    // Calculation errors increase risk
    if (activityDetails.calculationErrors) riskScore += 2;

    // Cart manipulation increases risk
    if (activityDetails.cartManipulation) riskScore += 3;

    if (riskScore >= 7) return 'critical';
    if (riskScore >= 5) return 'high';
    if (riskScore >= 3) return 'medium';
    return 'low';
  }

  /**
   * Map database audit log to interface
   */
  private mapAuditLogFromDb(dbLog: any): PromotionAuditLog {
    return {
      id: dbLog.id,
      eventType: dbLog.eventType,
      promotionId: dbLog.promotionId,
      userId: dbLog.userId,
      customerId: dbLog.customerId,
      entityType: dbLog.entityType,
      entityId: dbLog.entityId,
      oldValues: dbLog.oldValues ? JSON.parse(dbLog.oldValues) : undefined,
      newValues: dbLog.newValues ? JSON.parse(dbLog.newValues) : undefined,
      metadata: dbLog.metadata ? JSON.parse(dbLog.metadata) : undefined,
      ipAddress: dbLog.ipAddress,
      userAgent: dbLog.userAgent,
      sessionId: dbLog.sessionId,
      timestamp: new Date(dbLog.timestamp),
      severity: dbLog.severity,
    };
  }
}

export const promotionAudit = new PromotionAudit();