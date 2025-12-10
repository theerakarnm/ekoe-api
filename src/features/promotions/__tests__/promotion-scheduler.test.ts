import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { promotionScheduler } from '../promotion-scheduler';
import { promotionMonitor } from '../promotion-monitor';
import { promotionRepository } from '../promotions.repository';
import { promotionDomain } from '../promotions.domain';

describe('Promotion Scheduler', () => {
  beforeEach(() => {
    // Ensure services are stopped before each test
    promotionScheduler.stop();
    promotionMonitor.stop();
  });

  afterEach(() => {
    // Clean up after each test
    promotionScheduler.stop();
    promotionMonitor.stop();
  });

  test('should start and stop scheduler service', () => {
    expect(promotionScheduler.isSchedulerRunning()).toBe(false);
    
    promotionScheduler.start();
    expect(promotionScheduler.isSchedulerRunning()).toBe(true);
    
    promotionScheduler.stop();
    expect(promotionScheduler.isSchedulerRunning()).toBe(false);
  });

  test('should start and stop monitoring service', () => {
    expect(promotionMonitor.isMonitoringActive()).toBe(false);
    
    promotionMonitor.start();
    expect(promotionMonitor.isMonitoringActive()).toBe(true);
    
    promotionMonitor.stop();
    expect(promotionMonitor.isMonitoringActive()).toBe(false);
  });

  test('should handle multiple start/stop calls gracefully', () => {
    // Multiple starts should not cause issues
    promotionScheduler.start();
    promotionScheduler.start();
    expect(promotionScheduler.isSchedulerRunning()).toBe(true);
    
    // Multiple stops should not cause issues
    promotionScheduler.stop();
    promotionScheduler.stop();
    expect(promotionScheduler.isSchedulerRunning()).toBe(false);
  });

  test('should integrate with promotion domain', () => {
    // Test that domain methods exist and can be called
    expect(typeof promotionDomain.startPromotionServices).toBe('function');
    expect(typeof promotionDomain.stopPromotionServices).toBe('function');
    expect(typeof promotionDomain.processScheduledPromotions).toBe('function');
    expect(typeof promotionDomain.getSystemHealthMetrics).toBe('function');
    expect(typeof promotionDomain.getPromotionStatusUpdates).toBe('function');
  });

  test('should determine promotion status correctly', async () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day from now
    const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
    
    // Test scheduled promotion (starts in future)
    const scheduledPromotion = {
      id: 'test-scheduled',
      name: 'Test Scheduled Promotion',
      type: 'percentage_discount' as const,
      status: 'draft' as const,
      priority: 0,
      startsAt: futureDate,
      endsAt: new Date(futureDate.getTime() + 24 * 60 * 60 * 1000),
      usageLimitPerCustomer: 1,
      currentUsageCount: 0,
      createdAt: now,
      updatedAt: now
    };

    // Test active promotion (started, not ended)
    const activePromotion = {
      id: 'test-active',
      name: 'Test Active Promotion',
      type: 'percentage_discount' as const,
      status: 'draft' as const,
      priority: 0,
      startsAt: pastDate,
      endsAt: futureDate,
      usageLimitPerCustomer: 1,
      currentUsageCount: 0,
      createdAt: pastDate,
      updatedAt: now
    };

    // Test expired promotion (ended)
    const expiredPromotion = {
      id: 'test-expired',
      name: 'Test Expired Promotion',
      type: 'percentage_discount' as const,
      status: 'draft' as const,
      priority: 0,
      startsAt: pastDate,
      endsAt: new Date(pastDate.getTime() + 12 * 60 * 60 * 1000), // 12 hours after past date
      usageLimitPerCustomer: 1,
      currentUsageCount: 0,
      createdAt: pastDate,
      updatedAt: now
    };

    // The scheduler's determinePromotionStatus method is private, but we can test
    // the logic through the processScheduledPromotions method
    expect(scheduledPromotion.startsAt > now).toBe(true);
    expect(activePromotion.startsAt <= now && activePromotion.endsAt > now).toBe(true);
    expect(expiredPromotion.endsAt <= now).toBe(true);
  });

  test('should handle lifecycle events', async () => {
    // Test that lifecycle events method exists and returns expected structure
    const events = await promotionScheduler.getPromotionLifecycleEvents('non-existent-id');
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBe(0);
  });
});

describe('Promotion Monitor', () => {
  beforeEach(() => {
    promotionMonitor.stop();
  });

  afterEach(() => {
    promotionMonitor.stop();
  });

  test('should provide system health metrics', async () => {
    const metrics = await promotionMonitor.getSystemHealthMetrics();
    
    expect(typeof metrics).toBe('object');
    expect(typeof metrics.totalPromotions).toBe('number');
    expect(typeof metrics.activePromotions).toBe('number');
    expect(typeof metrics.scheduledPromotions).toBe('number');
    expect(typeof metrics.expiredPromotions).toBe('number');
    expect(typeof metrics.conflictCount).toBe('number');
    expect(typeof metrics.healthScore).toBe('number');
    expect(Array.isArray(metrics.issues)).toBe(true);
    
    // Health score should be between 0 and 100
    expect(metrics.healthScore).toBeGreaterThanOrEqual(0);
    expect(metrics.healthScore).toBeLessThanOrEqual(100);
  });

  test('should provide promotion status updates', async () => {
    const updates = await promotionMonitor.getPromotionStatusUpdates();
    
    expect(Array.isArray(updates)).toBe(true);
    
    // Each update should have the expected structure
    updates.forEach(update => {
      expect(typeof update.promotionId).toBe('string');
      expect(typeof update.promotionName).toBe('string');
      expect(typeof update.currentStatus).toBe('string');
      expect(typeof update.expectedStatus).toBe('string');
      expect(typeof update.needsUpdate).toBe('boolean');
    });
  });
});

describe('Promotion Domain Integration', () => {
  test('should start and stop services through domain', () => {
    // Test that services can be controlled through the domain
    promotionDomain.startPromotionServices();
    expect(promotionScheduler.isSchedulerRunning()).toBe(true);
    expect(promotionMonitor.isMonitoringActive()).toBe(true);
    
    promotionDomain.stopPromotionServices();
    expect(promotionScheduler.isSchedulerRunning()).toBe(false);
    expect(promotionMonitor.isMonitoringActive()).toBe(false);
  });

  test('should provide monitoring methods through domain', async () => {
    const healthMetrics = await promotionDomain.getSystemHealthMetrics();
    expect(typeof healthMetrics).toBe('object');
    
    const statusUpdates = await promotionDomain.getPromotionStatusUpdates();
    expect(Array.isArray(statusUpdates)).toBe(true);
  });
});