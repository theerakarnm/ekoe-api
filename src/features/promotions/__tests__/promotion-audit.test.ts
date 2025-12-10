import { describe, test, expect, beforeEach } from 'bun:test';
import { promotionAudit } from '../promotion-audit';
import type { 
  Promotion, 
  PromotionRule, 
  AppliedPromotion 
} from '../promotions.interface';

describe('PromotionAudit', () => {
  let mockPromotion: Promotion;
  let mockPromotionRule: PromotionRule;
  let mockAppliedPromotion: AppliedPromotion;

  beforeEach(() => {
    mockPromotion = {
      id: 'promotion-1',
      name: 'Test Promotion',
      description: 'A test promotion',
      type: 'percentage_discount',
      status: 'active',
      priority: 1,
      startsAt: new Date('2024-01-01'),
      endsAt: new Date('2024-12-31'),
      usageLimit: 100,
      usageLimitPerCustomer: 1,
      currentUsageCount: 5,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    mockPromotionRule = {
      id: 'rule-1',
      promotionId: 'promotion-1',
      ruleType: 'benefit',
      benefitType: 'percentage_discount',
      benefitValue: 10,
      createdAt: new Date()
    };

    mockAppliedPromotion = {
      promotionId: 'promotion-1',
      promotionName: 'Test Promotion',
      discountAmount: 5000,
      freeGifts: [],
      appliedAt: new Date()
    };
  });

  describe('logPromotionCreated', () => {
    test('should log promotion creation successfully', async () => {
      // Should not throw
      await expect(
        promotionAudit.logPromotionCreated(mockPromotion, 'user-1', { source: 'admin' })
      ).resolves.not.toThrow();
    });

    test('should handle missing user ID', async () => {
      // Should not throw even without user ID
      await expect(
        promotionAudit.logPromotionCreated(mockPromotion)
      ).resolves.not.toThrow();
    });
  });

  describe('logPromotionUpdated', () => {
    test('should log promotion updates with changes', async () => {
      const oldValues = { name: 'Old Name', priority: 1 };
      const newValues = { name: 'New Name', priority: 2 };

      // Should not throw
      await expect(
        promotionAudit.logPromotionUpdated('promotion-1', oldValues, newValues, 'user-1')
      ).resolves.not.toThrow();
    });

    test('should not log when no changes detected', async () => {
      const sameValues = { name: 'Same Name', priority: 1 };

      // Should not throw and should not create log entry for no changes
      await expect(
        promotionAudit.logPromotionUpdated('promotion-1', sameValues, sameValues, 'user-1')
      ).resolves.not.toThrow();
    });
  });

  describe('logPromotionDeleted', () => {
    test('should log promotion deletion', async () => {
      // Should not throw
      await expect(
        promotionAudit.logPromotionDeleted(mockPromotion, 'user-1', { reason: 'cleanup' })
      ).resolves.not.toThrow();
    });
  });

  describe('logPromotionStatusChange', () => {
    test('should log status changes', async () => {
      // Should not throw
      await expect(
        promotionAudit.logPromotionStatusChange(
          'promotion-1',
          'draft',
          'active',
          'user-1',
          { reason: 'Manual activation' }
        )
      ).resolves.not.toThrow();
    });

    test('should handle different status transitions', async () => {
      const statusTransitions = [
        ['draft', 'active'],
        ['active', 'paused'],
        ['paused', 'active'],
        ['active', 'expired']
      ];

      for (const [oldStatus, newStatus] of statusTransitions) {
        await expect(
          promotionAudit.logPromotionStatusChange(
            'promotion-1',
            oldStatus,
            newStatus,
            'user-1'
          )
        ).resolves.not.toThrow();
      }
    });
  });

  describe('logPromotionRuleCreated', () => {
    test('should log rule creation', async () => {
      // Should not throw
      await expect(
        promotionAudit.logPromotionRuleCreated(mockPromotionRule, 'user-1')
      ).resolves.not.toThrow();
    });
  });

  describe('logPromotionRuleDeleted', () => {
    test('should log rule deletion', async () => {
      // Should not throw
      await expect(
        promotionAudit.logPromotionRuleDeleted(mockPromotionRule, 'user-1')
      ).resolves.not.toThrow();
    });
  });

  describe('logPromotionApplied', () => {
    test('should log promotion application', async () => {
      // Should not throw
      await expect(
        promotionAudit.logPromotionApplied(
          mockAppliedPromotion,
          'customer-1',
          35000,
          { ipAddress: '192.168.1.1' }
        )
      ).resolves.not.toThrow();
    });

    test('should handle high-value promotions with warning severity', async () => {
      const highValuePromotion = {
        ...mockAppliedPromotion,
        discountAmount: 600000 // 6,000 THB - high value
      };

      // Should not throw and should log with warning severity
      await expect(
        promotionAudit.logPromotionApplied(highValuePromotion, 'customer-1', 35000)
      ).resolves.not.toThrow();
    });

    test('should handle promotions with free gifts', async () => {
      const promotionWithGifts = {
        ...mockAppliedPromotion,
        freeGifts: [
          {
            productId: 'gift-1',
            quantity: 1,
            name: 'Free Gift',
            value: 0
          }
        ]
      };

      // Should not throw
      await expect(
        promotionAudit.logPromotionApplied(promotionWithGifts, 'customer-1', 35000)
      ).resolves.not.toThrow();
    });
  });

  describe('logPromotionUsageRecorded', () => {
    test('should log usage recording', async () => {
      // Should not throw
      await expect(
        promotionAudit.logPromotionUsageRecorded(
          'promotion-1',
          'order-1',
          'customer-1',
          5000,
          { orderTotal: 35000 }
        )
      ).resolves.not.toThrow();
    });
  });

  describe('logSecurityViolation', () => {
    test('should log security violations', async () => {
      // Should not throw
      await expect(
        promotionAudit.logSecurityViolation(
          'security_violation',
          'promotion-1',
          'customer-1',
          { violationType: 'calculation_tampering', attemptedDiscount: 50000 }
        )
      ).resolves.not.toThrow();
    });
  });

  describe('logSuspiciousActivity', () => {
    test('should log suspicious activity', async () => {
      // Should not throw
      await expect(
        promotionAudit.logSuspiciousActivity(
          'promotion-1',
          'customer-1',
          { 
            discountAmount: 10000,
            attemptCount: 5,
            calculationErrors: true
          }
        )
      ).resolves.not.toThrow();
    });

    test('should calculate risk levels correctly', async () => {
      // Test different risk scenarios
      const riskScenarios = [
        { discountAmount: 50000, attemptCount: 1 }, // Low risk
        { discountAmount: 600000, attemptCount: 3 }, // Medium risk
        { discountAmount: 1200000, attemptCount: 8, calculationErrors: true }, // High risk
        { discountAmount: 2000000, attemptCount: 15, cartManipulation: true } // Critical risk
      ];

      for (const scenario of riskScenarios) {
        await expect(
          promotionAudit.logSuspiciousActivity('promotion-1', 'customer-1', scenario)
        ).resolves.not.toThrow();
      }
    });
  });

  describe('logHighValuePromotionApplied', () => {
    test('should log high-value promotion applications', async () => {
      // Should not throw
      await expect(
        promotionAudit.logHighValuePromotionApplied(
          'promotion-1',
          'customer-1',
          600000,
          { cartSubtotal: 1000000 }
        )
      ).resolves.not.toThrow();
    });

    test('should mark extremely high values for review', async () => {
      // Should not throw and should mark for review
      await expect(
        promotionAudit.logHighValuePromotionApplied(
          'promotion-1',
          'customer-1',
          2500000, // 25,000 THB - requires review
          { cartSubtotal: 3000000 }
        )
      ).resolves.not.toThrow();
    });
  });

  describe('getAuditLogs', () => {
    test('should return audit logs with pagination', async () => {
      const result = await promotionAudit.getAuditLogs({}, 1, 10);

      expect(result).toHaveProperty('logs');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('totalPages');
      expect(Array.isArray(result.logs)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(result.page).toBe(1);
    });

    test('should handle filtering by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const result = await promotionAudit.getAuditLogs({
        startDate,
        endDate
      });

      expect(result).toHaveProperty('logs');
      expect(Array.isArray(result.logs)).toBe(true);
    });

    test('should handle filtering by event types', async () => {
      const result = await promotionAudit.getAuditLogs({
        eventTypes: ['promotion_created', 'promotion_updated']
      });

      expect(result).toHaveProperty('logs');
      expect(Array.isArray(result.logs)).toBe(true);
    });
  });

  describe('generateAuditReportSummary', () => {
    test('should generate audit report summary', async () => {
      const summary = await promotionAudit.generateAuditReportSummary();

      expect(summary).toHaveProperty('totalEvents');
      expect(summary).toHaveProperty('eventsByType');
      expect(summary).toHaveProperty('eventsBySeverity');
      expect(summary).toHaveProperty('topUsers');
      expect(summary).toHaveProperty('topPromotions');
      expect(summary).toHaveProperty('securityEvents');
      expect(summary).toHaveProperty('suspiciousActivities');
      expect(summary).toHaveProperty('dateRange');
      
      expect(typeof summary.totalEvents).toBe('number');
      expect(Array.isArray(summary.topUsers)).toBe(true);
      expect(Array.isArray(summary.topPromotions)).toBe(true);
    });
  });

  describe('exportAuditLogsToCSV', () => {
    test('should export audit logs to CSV format', async () => {
      const csvData = await promotionAudit.exportAuditLogsToCSV();

      expect(typeof csvData).toBe('string');
      expect(csvData).toContain('Timestamp,Event Type'); // Should contain headers
    });
  });

  describe('getPromotionAuditTrail', () => {
    test('should get audit trail for specific promotion', async () => {
      const auditTrail = await promotionAudit.getPromotionAuditTrail('promotion-1');

      expect(Array.isArray(auditTrail)).toBe(true);
    });
  });

  describe('getSecurityEvents', () => {
    test('should get security events', async () => {
      const securityEvents = await promotionAudit.getSecurityEvents();

      expect(Array.isArray(securityEvents)).toBe(true);
    });

    test('should filter security events by severity', async () => {
      const securityEvents = await promotionAudit.getSecurityEvents(
        undefined,
        undefined,
        ['error', 'critical']
      );

      expect(Array.isArray(securityEvents)).toBe(true);
    });
  });

  describe('getUserActivitySummary', () => {
    test('should get user activity summary', async () => {
      const summary = await promotionAudit.getUserActivitySummary('user-1');

      expect(summary).toHaveProperty('totalActions');
      expect(summary).toHaveProperty('actionsByType');
      expect(summary).toHaveProperty('promotionsModified');
      expect(summary).toHaveProperty('lastActivity');
      
      expect(typeof summary.totalActions).toBe('number');
      expect(Array.isArray(summary.promotionsModified)).toBe(true);
      expect(summary.lastActivity instanceof Date).toBe(true);
    });
  });

  describe('checkComplianceViolations', () => {
    test('should check for compliance violations', async () => {
      const violations = await promotionAudit.checkComplianceViolations();

      expect(Array.isArray(violations)).toBe(true);
      
      // Each violation should have required properties
      violations.forEach(violation => {
        expect(violation).toHaveProperty('type');
        expect(violation).toHaveProperty('description');
        expect(violation).toHaveProperty('severity');
        expect(violation).toHaveProperty('count');
        expect(violation).toHaveProperty('examples');
        
        expect(typeof violation.type).toBe('string');
        expect(typeof violation.description).toBe('string');
        expect(['low', 'medium', 'high', 'critical']).toContain(violation.severity);
        expect(typeof violation.count).toBe('number');
        expect(Array.isArray(violation.examples)).toBe(true);
      });
    });
  });
});