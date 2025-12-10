import { promotionRepository } from './promotions.repository';
import logger from '../../core/logger';
import type { Promotion, PromotionStatus } from './promotions.interface';

/**
 * Promotion scheduler service for automatic activation/deactivation
 * and lifecycle management of promotions
 */
export class PromotionScheduler {
  private schedulerInterval: NodeJS.Timeout | null = null;
  private readonly SCHEDULER_INTERVAL_MS = 60000; // Check every minute
  private isRunning = false;

  /**
   * Start the promotion scheduler
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Promotion scheduler is already running');
      return;
    }

    logger.info('Starting promotion scheduler');
    this.isRunning = true;

    // Run initial check
    this.processScheduledPromotions().catch(error => {
      logger.error({ error }, 'Error in initial promotion scheduler run');
    });

    // Set up recurring checks
    this.schedulerInterval = setInterval(() => {
      this.processScheduledPromotions().catch(error => {
        logger.error({ error }, 'Error in promotion scheduler');
      });
    }, this.SCHEDULER_INTERVAL_MS);
  }

  /**
   * Stop the promotion scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Promotion scheduler is not running');
      return;
    }

    logger.info('Stopping promotion scheduler');
    
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    
    this.isRunning = false;
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Process all promotions that need status updates
   */
  async processScheduledPromotions(): Promise<void> {
    try {
      logger.debug('Processing scheduled promotions');
      
      const promotionsToUpdate = await promotionRepository.getPromotionsForStatusUpdate();
      
      if (promotionsToUpdate.length === 0) {
        logger.debug('No promotions need status updates');
        return;
      }

      logger.info(`Processing ${promotionsToUpdate.length} promotions for status updates`);

      const results = {
        activated: 0,
        expired: 0,
        errors: 0
      };

      for (const promotion of promotionsToUpdate) {
        try {
          const newStatus = this.determinePromotionStatus(promotion.startsAt, promotion.endsAt);
          
          if (newStatus !== promotion.status) {
            await this.updatePromotionStatus(promotion, newStatus);
            
            if (newStatus === 'active') {
              results.activated++;
              await this.handlePromotionActivation(promotion);
            } else if (newStatus === 'expired') {
              results.expired++;
              await this.handlePromotionExpiration(promotion);
            }
          }
        } catch (error) {
          results.errors++;
          logger.error({
            promotionId: promotion.id,
            promotionName: promotion.name,
            error
          }, 'Error updating promotion status');
        }
      }

      logger.info(results, 'Promotion scheduler completed');
    } catch (error) {
      logger.error({ error }, 'Error in processScheduledPromotions');
      throw error;
    }
  }

  /**
   * Manually activate a promotion
   */
  async activatePromotion(promotionId: string): Promise<void> {
    const promotion = await promotionRepository.getPromotionById(promotionId);
    if (!promotion) {
      throw new Error(`Promotion not found: ${promotionId}`);
    }

    if (promotion.status === 'active') {
      logger.warn(`Promotion ${promotionId} is already active`);
      return;
    }

    const now = new Date();
    
    // Validate activation conditions
    if (promotion.startsAt > now) {
      throw new Error(`Cannot activate promotion ${promotionId} before its start date`);
    }

    if (promotion.endsAt <= now) {
      throw new Error(`Cannot activate expired promotion ${promotionId}`);
    }

    await this.updatePromotionStatus(promotion, 'active');
    await this.handlePromotionActivation(promotion);
    
    logger.info({
      promotionId: promotion.id,
      promotionName: promotion.name
    }, 'Manually activated promotion');
  }

  /**
   * Manually deactivate a promotion
   */
  async deactivatePromotion(promotionId: string): Promise<void> {
    const promotion = await promotionRepository.getPromotionById(promotionId);
    if (!promotion) {
      throw new Error(`Promotion not found: ${promotionId}`);
    }

    if (promotion.status !== 'active') {
      throw new Error(`Cannot deactivate promotion ${promotionId} - not currently active`);
    }

    await this.updatePromotionStatus(promotion, 'paused');
    await this.handlePromotionDeactivation(promotion);
    
    logger.info({
      promotionId: promotion.id,
      promotionName: promotion.name
    }, 'Manually deactivated promotion');
  }

  /**
   * Pause an active promotion
   */
  async pausePromotion(promotionId: string): Promise<void> {
    const promotion = await promotionRepository.getPromotionById(promotionId);
    if (!promotion) {
      throw new Error(`Promotion not found: ${promotionId}`);
    }

    if (promotion.status !== 'active') {
      throw new Error(`Cannot pause promotion ${promotionId} - not currently active`);
    }

    await this.updatePromotionStatus(promotion, 'paused');
    await this.handlePromotionPause(promotion);
    
    logger.info({
      promotionId: promotion.id,
      promotionName: promotion.name
    }, 'Paused promotion');
  }

  /**
   * Resume a paused promotion
   */
  async resumePromotion(promotionId: string): Promise<void> {
    const promotion = await promotionRepository.getPromotionById(promotionId);
    if (!promotion) {
      throw new Error(`Promotion not found: ${promotionId}`);
    }

    if (promotion.status !== 'paused') {
      throw new Error(`Cannot resume promotion ${promotionId} - not currently paused`);
    }

    const now = new Date();
    
    // Check if promotion is still within valid time range
    if (promotion.endsAt <= now) {
      await this.updatePromotionStatus(promotion, 'expired');
      throw new Error(`Cannot resume expired promotion ${promotionId}`);
    }

    if (promotion.startsAt > now) {
      await this.updatePromotionStatus(promotion, 'scheduled');
      logger.info(`Promotion ${promotionId} moved to scheduled status`);
      return;
    }

    await this.updatePromotionStatus(promotion, 'active');
    await this.handlePromotionActivation(promotion);
    
    logger.info({
      promotionId: promotion.id,
      promotionName: promotion.name
    }, 'Resumed promotion');
  }

  /**
   * Get promotion lifecycle events for monitoring
   */
  async getPromotionLifecycleEvents(promotionId: string): Promise<Array<{
    event: string;
    timestamp: Date;
    status: PromotionStatus;
    details?: any;
  }>> {
    // This would typically be stored in a separate events table
    // For now, we'll return basic lifecycle information
    const promotion = await promotionRepository.getPromotionById(promotionId);
    if (!promotion) {
      return [];
    }

    const events = [
      {
        event: 'created',
        timestamp: promotion.createdAt,
        status: 'draft' as PromotionStatus,
        details: { createdBy: promotion.createdBy } as any
      }
    ];

    // Add scheduled event if applicable
    if (promotion.startsAt > promotion.createdAt) {
      events.push({
        event: 'scheduled',
        timestamp: promotion.createdAt,
        status: 'scheduled' as PromotionStatus,
        details: { 
          startsAt: promotion.startsAt.toISOString(), 
          endsAt: promotion.endsAt.toISOString()
        } as any
      });
    }

    // Add current status event
    if (promotion.status !== 'draft') {
      events.push({
        event: promotion.status,
        timestamp: promotion.updatedAt,
        status: promotion.status,
        details: { createdBy: promotion.createdBy } as any
      });
    }

    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Determine the correct status for a promotion based on current time
   */
  private determinePromotionStatus(startsAt: Date, endsAt: Date): PromotionStatus {
    const now = new Date();
    
    if (now < startsAt) {
      return 'scheduled';
    } else if (now >= startsAt && now < endsAt) {
      return 'active';
    } else {
      return 'expired';
    }
  }

  /**
   * Update promotion status in database
   */
  private async updatePromotionStatus(promotion: Promotion, newStatus: PromotionStatus): Promise<void> {
    const success = await promotionRepository.updatePromotionStatus(promotion.id, newStatus);
    if (!success) {
      throw new Error(`Failed to update promotion status for ${promotion.id}`);
    }

    logger.info({
      promotionId: promotion.id,
      promotionName: promotion.name,
      oldStatus: promotion.status,
      newStatus
    }, 'Promotion status updated');
  }

  /**
   * Handle promotion activation event
   */
  private async handlePromotionActivation(promotion: Promotion): Promise<void> {
    logger.info({
      promotionId: promotion.id,
      promotionName: promotion.name,
      type: promotion.type,
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt
    }, 'Promotion activated');

    // Here you could add additional activation logic such as:
    // - Sending notifications to administrators
    // - Clearing related caches
    // - Triggering analytics events
    // - Updating external systems
    
    try {
      // Record activation analytics
      await this.recordPromotionEvent(promotion.id, 'activated');
      
      // Log activation for audit trail
      logger.info({
        promotionId: promotion.id,
        activatedAt: new Date()
      }, 'Promotion activation completed');
    } catch (error) {
      logger.error({
        promotionId: promotion.id,
        error
      }, 'Error in promotion activation handler');
      // Don't throw - activation was successful, just logging failed
    }
  }

  /**
   * Handle promotion expiration event
   */
  private async handlePromotionExpiration(promotion: Promotion): Promise<void> {
    logger.info({
      promotionId: promotion.id,
      promotionName: promotion.name,
      type: promotion.type,
      endsAt: promotion.endsAt
    }, 'Promotion expired');

    try {
      // Record expiration analytics
      await this.recordPromotionEvent(promotion.id, 'expired');
      
      // Perform cleanup tasks
      await this.cleanupExpiredPromotion(promotion);
      
      logger.info({
        promotionId: promotion.id,
        expiredAt: new Date()
      }, 'Promotion expiration completed');
    } catch (error) {
      logger.error({
        promotionId: promotion.id,
        error
      }, 'Error in promotion expiration handler');
    }
  }

  /**
   * Handle promotion deactivation event
   */
  private async handlePromotionDeactivation(promotion: Promotion): Promise<void> {
    logger.info({
      promotionId: promotion.id,
      promotionName: promotion.name
    }, 'Promotion deactivated');

    try {
      // Record deactivation analytics
      await this.recordPromotionEvent(promotion.id, 'deactivated');
      
      logger.info({
        promotionId: promotion.id,
        deactivatedAt: new Date()
      }, 'Promotion deactivation completed');
    } catch (error) {
      logger.error({
        promotionId: promotion.id,
        error
      }, 'Error in promotion deactivation handler');
    }
  }

  /**
   * Handle promotion pause event
   */
  private async handlePromotionPause(promotion: Promotion): Promise<void> {
    logger.info({
      promotionId: promotion.id,
      promotionName: promotion.name
    }, 'Promotion paused');

    try {
      // Record pause analytics
      await this.recordPromotionEvent(promotion.id, 'paused');
      
      logger.info({
        promotionId: promotion.id,
        pausedAt: new Date()
      }, 'Promotion pause completed');
    } catch (error) {
      logger.error({
        promotionId: promotion.id,
        error
      }, 'Error in promotion pause handler');
    }
  }

  /**
   * Cleanup tasks for expired promotions
   */
  private async cleanupExpiredPromotion(promotion: Promotion): Promise<void> {
    // Here you could add cleanup logic such as:
    // - Removing cached promotion data
    // - Updating related systems
    // - Generating final reports
    
    logger.debug({
      promotionId: promotion.id
    }, 'Cleaning up expired promotion');
  }

  /**
   * Record promotion lifecycle events for analytics
   */
  private async recordPromotionEvent(promotionId: string, event: string): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const hour = new Date().getHours();
      
      // Record the event in analytics
      await promotionRepository.recordPromotionAnalytics({
        promotionId,
        date: today,
        hour,
        views: 0,
        applications: 0,
        totalDiscountAmount: 0,
        totalOrders: 0,
        totalRevenue: 0
      });
      
      logger.debug({
        promotionId,
        event,
        date: today,
        hour
      }, 'Promotion event recorded');
    } catch (error) {
      logger.error({
        promotionId,
        event,
        error
      }, 'Error recording promotion event');
    }
  }
}

export const promotionScheduler = new PromotionScheduler();