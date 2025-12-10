import { promotionRepository } from './promotions.repository';
import logger from '../../core/logger';
import type { Promotion, PromotionStatus } from './promotions.interface';

/**
 * Promotion monitoring service for real-time status updates,
 * conflict detection, and system health monitoring
 */
export class PromotionMonitor {
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly MONITORING_INTERVAL_MS = 30000; // Check every 30 seconds
  private isMonitoring = false;
  private readonly conflictCache = new Map<string, Date>();
  private readonly CONFLICT_CACHE_TTL_MS = 300000; // 5 minutes

  /**
   * Start the promotion monitoring service
   */
  start(): void {
    if (this.isMonitoring) {
      logger.warn('Promotion monitor is already running');
      return;
    }

    logger.info('Starting promotion monitor');
    this.isMonitoring = true;

    // Run initial monitoring check
    this.performMonitoringCheck().catch(error => {
      logger.error('Error in initial promotion monitoring check', { error });
    });

    // Set up recurring monitoring
    this.monitoringInterval = setInterval(() => {
      this.performMonitoringCheck().catch(error => {
        logger.error('Error in promotion monitoring', { error });
      });
    }, this.MONITORING_INTERVAL_MS);
  }

  /**
   * Stop the promotion monitoring service
   */
  stop(): void {
    if (!this.isMonitoring) {
      logger.warn('Promotion monitor is not running');
      return;
    }

    logger.info('Stopping promotion monitor');
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.isMonitoring = false;
    this.conflictCache.clear();
  }

  /**
   * Check if monitoring is running
   */
  isMonitoringActive(): boolean {
    return this.isMonitoring;
  }

  /**
   * Perform comprehensive monitoring check
   */
  async performMonitoringCheck(): Promise<void> {
    try {
      logger.debug('Performing promotion monitoring check');

      const checks = await Promise.allSettled([
        this.checkPromotionHealth(),
        this.detectPromotionConflicts(),
        this.monitorUsageLimits(),
        this.cleanupExpiredData()
      ]);

      // Log any failed checks
      checks.forEach((result, index) => {
        if (result.status === 'rejected') {
          const checkNames = ['health', 'conflicts', 'usage limits', 'cleanup'];
          logger.error(`Monitoring check failed: ${checkNames[index]}`, {
            error: result.reason
          });
        }
      });

      logger.debug('Promotion monitoring check completed');
    } catch (error) {
      logger.error('Error in performMonitoringCheck', { error });
    }
  }

  /**
   * Check overall promotion system health
   */
  async checkPromotionHealth(): Promise<void> {
    try {
      const activePromotions = await promotionRepository.getActivePromotions();
      const now = new Date();
      
      const healthMetrics = {
        totalActive: activePromotions.length,
        expiredButActive: 0,
        futureButActive: 0,
        usageLimitExceeded: 0
      };

      for (const promotion of activePromotions) {
        // Check for promotions that should be expired
        if (promotion.endsAt <= now) {
          healthMetrics.expiredButActive++;
          logger.warn('Active promotion is past end date', {
            promotionId: promotion.id,
            promotionName: promotion.name,
            endsAt: promotion.endsAt
          });
        }

        // Check for promotions that shouldn't be active yet
        if (promotion.startsAt > now) {
          healthMetrics.futureButActive++;
          logger.warn('Active promotion is before start date', {
            promotionId: promotion.id,
            promotionName: promotion.name,
            startsAt: promotion.startsAt
          });
        }

        // Check for promotions that have exceeded usage limits
        if (promotion.usageLimit && promotion.currentUsageCount >= promotion.usageLimit) {
          healthMetrics.usageLimitExceeded++;
          logger.warn('Active promotion has exceeded usage limit', {
            promotionId: promotion.id,
            promotionName: promotion.name,
            currentUsage: promotion.currentUsageCount,
            limit: promotion.usageLimit
          });
        }
      }

      // Log health summary
      if (healthMetrics.expiredButActive > 0 || 
          healthMetrics.futureButActive > 0 || 
          healthMetrics.usageLimitExceeded > 0) {
        logger.warn('Promotion health issues detected', healthMetrics);
      } else {
        logger.debug('Promotion system health check passed', healthMetrics);
      }
    } catch (error) {
      logger.error('Error in promotion health check', { error });
      throw error;
    }
  }

  /**
   * Detect and report promotion conflicts
   */
  async detectPromotionConflicts(): Promise<void> {
    try {
      const activePromotions = await promotionRepository.getActivePromotions();
      const conflicts: Array<{
        type: string;
        promotions: string[];
        details: any;
      }> = [];

      // Check for overlapping exclusive promotions
      for (let i = 0; i < activePromotions.length; i++) {
        const promotion1 = activePromotions[i];
        
        if (!promotion1.exclusiveWith || promotion1.exclusiveWith.length === 0) {
          continue;
        }

        for (let j = i + 1; j < activePromotions.length; j++) {
          const promotion2 = activePromotions[j];
          
          if (promotion1.exclusiveWith.includes(promotion2.id)) {
            const conflictKey = [promotion1.id, promotion2.id].sort().join('-');
            
            // Check if we've already reported this conflict recently
            if (this.isConflictCached(conflictKey)) {
              continue;
            }

            conflicts.push({
              type: 'exclusive_conflict',
              promotions: [promotion1.id, promotion2.id],
              details: {
                promotion1: { id: promotion1.id, name: promotion1.name },
                promotion2: { id: promotion2.id, name: promotion2.name }
              }
            });

            // Cache this conflict to avoid spam
            this.cacheConflict(conflictKey);
          }
        }
      }

      // Check for priority conflicts (same priority, overlapping periods)
      const priorityGroups = new Map<number, Promotion[]>();
      activePromotions.forEach(promotion => {
        const priority = promotion.priority;
        if (!priorityGroups.has(priority)) {
          priorityGroups.set(priority, []);
        }
        priorityGroups.get(priority)!.push(promotion);
      });

      priorityGroups.forEach((promotions, priority) => {
        if (promotions.length > 1) {
          // Check if any of these promotions have overlapping periods
          for (let i = 0; i < promotions.length; i++) {
            for (let j = i + 1; j < promotions.length; j++) {
              const p1 = promotions[i];
              const p2 = promotions[j];
              
              if (this.doPeriodsOverlap(p1.startsAt, p1.endsAt, p2.startsAt, p2.endsAt)) {
                const conflictKey = `priority-${[p1.id, p2.id].sort().join('-')}`;
                
                if (!this.isConflictCached(conflictKey)) {
                  conflicts.push({
                    type: 'priority_conflict',
                    promotions: [p1.id, p2.id],
                    details: {
                      priority,
                      promotion1: { id: p1.id, name: p1.name, period: [p1.startsAt, p1.endsAt] },
                      promotion2: { id: p2.id, name: p2.name, period: [p2.startsAt, p2.endsAt] }
                    }
                  });
                  
                  this.cacheConflict(conflictKey);
                }
              }
            }
          }
        }
      });

      // Report conflicts
      if (conflicts.length > 0) {
        logger.warn('Promotion conflicts detected', {
          conflictCount: conflicts.length,
          conflicts
        });
      } else {
        logger.debug('No promotion conflicts detected');
      }
    } catch (error) {
      logger.error('Error in promotion conflict detection', { error });
      throw error;
    }
  }

  /**
   * Monitor promotion usage limits
   */
  async monitorUsageLimits(): Promise<void> {
    try {
      const activePromotions = await promotionRepository.getActivePromotions();
      const usageWarnings: Array<{
        promotionId: string;
        promotionName: string;
        type: string;
        details: any;
      }> = [];

      for (const promotion of activePromotions) {
        // Check total usage limit
        if (promotion.usageLimit) {
          const usagePercentage = (promotion.currentUsageCount / promotion.usageLimit) * 100;
          
          if (usagePercentage >= 90) {
            usageWarnings.push({
              promotionId: promotion.id,
              promotionName: promotion.name,
              type: 'usage_limit_warning',
              details: {
                currentUsage: promotion.currentUsageCount,
                limit: promotion.usageLimit,
                percentage: Math.round(usagePercentage)
              }
            });
          }
        }

        // Get usage statistics for additional monitoring
        try {
          const stats = await promotionRepository.getPromotionUsageStats(promotion.id);
          
          // Check for unusual usage patterns
          if (stats.totalUsage > 0) {
            const avgOrderValue = stats.totalRevenue / stats.totalUsage;
            const avgDiscount = stats.totalDiscount / stats.totalUsage;
            
            // Flag if average discount is unusually high (>50% of order value)
            if (avgDiscount > (avgOrderValue * 0.5)) {
              usageWarnings.push({
                promotionId: promotion.id,
                promotionName: promotion.name,
                type: 'high_discount_warning',
                details: {
                  avgOrderValue: Math.round(avgOrderValue),
                  avgDiscount: Math.round(avgDiscount),
                  discountPercentage: Math.round((avgDiscount / avgOrderValue) * 100)
                }
              });
            }
          }
        } catch (error) {
          logger.debug('Could not get usage stats for promotion', {
            promotionId: promotion.id,
            error: error.message
          });
        }
      }

      // Report usage warnings
      if (usageWarnings.length > 0) {
        logger.warn('Promotion usage warnings detected', {
          warningCount: usageWarnings.length,
          warnings: usageWarnings
        });
      } else {
        logger.debug('No promotion usage warnings');
      }
    } catch (error) {
      logger.error('Error in promotion usage monitoring', { error });
      throw error;
    }
  }

  /**
   * Clean up expired monitoring data
   */
  async cleanupExpiredData(): Promise<void> {
    try {
      // Clean up conflict cache
      const now = new Date();
      let cleanedCount = 0;
      
      for (const [key, timestamp] of this.conflictCache.entries()) {
        if (now.getTime() - timestamp.getTime() > this.CONFLICT_CACHE_TTL_MS) {
          this.conflictCache.delete(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug('Cleaned up expired conflict cache entries', { cleanedCount });
      }

      // Here you could add additional cleanup tasks such as:
      // - Archiving old analytics data
      // - Cleaning up temporary monitoring files
      // - Removing stale cache entries
      
    } catch (error) {
      logger.error('Error in cleanup expired data', { error });
      throw error;
    }
  }

  /**
   * Get real-time promotion status updates
   */
  async getPromotionStatusUpdates(): Promise<Array<{
    promotionId: string;
    promotionName: string;
    currentStatus: PromotionStatus;
    expectedStatus: PromotionStatus;
    needsUpdate: boolean;
    timeToNextChange?: Date;
  }>> {
    try {
      const allPromotions = await promotionRepository.getPromotions({ limit: 1000 });
      const now = new Date();
      const updates: Array<any> = [];

      for (const promotion of allPromotions.promotions) {
        const fullPromotion = await promotionRepository.getPromotionById(promotion.id);
        if (!fullPromotion) continue;

        const expectedStatus = this.determineExpectedStatus(fullPromotion.startsAt, fullPromotion.endsAt);
        const needsUpdate = fullPromotion.status !== expectedStatus;
        
        let timeToNextChange: Date | undefined;
        
        // Calculate when the next status change should occur
        if (fullPromotion.status === 'scheduled' && fullPromotion.startsAt > now) {
          timeToNextChange = fullPromotion.startsAt;
        } else if (fullPromotion.status === 'active' && fullPromotion.endsAt > now) {
          timeToNextChange = fullPromotion.endsAt;
        }

        updates.push({
          promotionId: fullPromotion.id,
          promotionName: fullPromotion.name,
          currentStatus: fullPromotion.status,
          expectedStatus,
          needsUpdate,
          timeToNextChange
        });
      }

      return updates;
    } catch (error) {
      logger.error('Error getting promotion status updates', { error });
      throw error;
    }
  }

  /**
   * Get promotion system health metrics
   */
  async getSystemHealthMetrics(): Promise<{
    totalPromotions: number;
    activePromotions: number;
    scheduledPromotions: number;
    expiredPromotions: number;
    conflictCount: number;
    healthScore: number;
    issues: string[];
  }> {
    try {
      const allPromotions = await promotionRepository.getPromotions({ limit: 1000 });
      const activePromotions = await promotionRepository.getActivePromotions();
      
      const metrics = {
        totalPromotions: allPromotions.total,
        activePromotions: activePromotions.length,
        scheduledPromotions: 0,
        expiredPromotions: 0,
        conflictCount: 0,
        healthScore: 100,
        issues: [] as string[]
      };

      // Count promotions by status
      for (const promotion of allPromotions.promotions) {
        if (promotion.status === 'scheduled') {
          metrics.scheduledPromotions++;
        } else if (promotion.status === 'expired') {
          metrics.expiredPromotions++;
        }
      }

      // Check for issues that affect health score
      const now = new Date();
      for (const promotion of activePromotions) {
        // Check for expired active promotions
        if (promotion.endsAt <= now) {
          metrics.healthScore -= 10;
          metrics.issues.push(`Promotion ${promotion.name} is active but expired`);
        }

        // Check for usage limit exceeded
        if (promotion.usageLimit && promotion.currentUsageCount >= promotion.usageLimit) {
          metrics.healthScore -= 5;
          metrics.issues.push(`Promotion ${promotion.name} has exceeded usage limit`);
        }
      }

      // Count conflicts (simplified - just check cache size)
      metrics.conflictCount = this.conflictCache.size;
      if (metrics.conflictCount > 0) {
        metrics.healthScore -= (metrics.conflictCount * 5);
        metrics.issues.push(`${metrics.conflictCount} promotion conflicts detected`);
      }

      // Ensure health score doesn't go below 0
      metrics.healthScore = Math.max(0, metrics.healthScore);

      return metrics;
    } catch (error) {
      logger.error('Error getting system health metrics', { error });
      throw error;
    }
  }

  /**
   * Check if a conflict is already cached
   */
  private isConflictCached(conflictKey: string): boolean {
    const cachedTime = this.conflictCache.get(conflictKey);
    if (!cachedTime) return false;
    
    const now = new Date();
    return (now.getTime() - cachedTime.getTime()) < this.CONFLICT_CACHE_TTL_MS;
  }

  /**
   * Cache a conflict to avoid repeated reporting
   */
  private cacheConflict(conflictKey: string): void {
    this.conflictCache.set(conflictKey, new Date());
  }

  /**
   * Check if two time periods overlap
   */
  private doPeriodsOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
    return start1 < end2 && start2 < end1;
  }

  /**
   * Determine expected status based on current time
   */
  private determineExpectedStatus(startsAt: Date, endsAt: Date): PromotionStatus {
    const now = new Date();
    
    if (now < startsAt) {
      return 'scheduled';
    } else if (now >= startsAt && now < endsAt) {
      return 'active';
    } else {
      return 'expired';
    }
  }
}

export const promotionMonitor = new PromotionMonitor();