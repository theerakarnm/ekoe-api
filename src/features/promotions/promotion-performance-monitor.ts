/**
 * Promotion Performance Monitoring Service
 * 
 * Task 12.3: Performance optimization and monitoring
 * - Add monitoring and alerting for promotion system health
 * - Track performance metrics and identify bottlenecks
 * 
 * Requirements: Performance and scalability
 */

import { logger } from '../../core/logger';
import { promotionCache } from './promotion-cache';
import { promotionMonitor } from './promotion-monitor';

/**
 * Performance metrics interface
 */
interface PerformanceMetrics {
  timestamp: number;
  evaluationTime: number;
  promotionsEvaluated: number;
  cartItemCount: number;
  memoryUsage: number;
  cacheHitRate: number;
  databaseQueries: number;
  errorCount: number;
}

/**
 * Performance alert interface
 */
interface PerformanceAlert {
  id: string;
  type: 'warning' | 'critical';
  metric: string;
  threshold: number;
  currentValue: number;
  message: string;
  timestamp: number;
  resolved: boolean;
}

/**
 * Performance thresholds configuration
 */
interface PerformanceThresholds {
  evaluationTimeWarning: number; // milliseconds
  evaluationTimeCritical: number; // milliseconds
  memoryUsageWarning: number; // bytes
  memoryUsageCritical: number; // bytes
  cacheHitRateWarning: number; // percentage
  cacheHitRateCritical: number; // percentage
  errorRateWarning: number; // percentage
  errorRateCritical: number; // percentage
}

/**
 * Performance monitoring service for the promotional system
 */
export class PromotionPerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private alerts: PerformanceAlert[] = [];
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  
  // Configuration
  private readonly MAX_METRICS_HISTORY = 1000;
  private readonly MONITORING_INTERVAL_MS = 30000; // 30 seconds
  private readonly ALERT_COOLDOWN_MS = 300000; // 5 minutes
  
  // Performance thresholds
  private thresholds: PerformanceThresholds = {
    evaluationTimeWarning: 1000, // 1 second
    evaluationTimeCritical: 3000, // 3 seconds
    memoryUsageWarning: 100 * 1024 * 1024, // 100MB
    memoryUsageCritical: 500 * 1024 * 1024, // 500MB
    cacheHitRateWarning: 70, // 70%
    cacheHitRateCritical: 50, // 50%
    errorRateWarning: 5, // 5%
    errorRateCritical: 10, // 10%
  };

  // Tracking variables
  private evaluationCount = 0;
  private totalEvaluationTime = 0;
  private errorCount = 0;
  private lastAlertTimes = new Map<string, number>();

  /**
   * Start performance monitoring
   */
  start(): void {
    if (this.isMonitoring) {
      logger.warn('Performance monitor is already running');
      return;
    }

    logger.info('Starting promotion performance monitor');
    this.isMonitoring = true;

    // Start periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.checkThresholds();
      this.cleanupOldData();
    }, this.MONITORING_INTERVAL_MS);
  }

  /**
   * Stop performance monitoring
   */
  stop(): void {
    if (!this.isMonitoring) {
      logger.warn('Performance monitor is not running');
      return;
    }

    logger.info('Stopping promotion performance monitor');
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.isMonitoring = false;
  }

  /**
   * Record promotion evaluation performance
   */
  recordEvaluation(
    evaluationTime: number,
    promotionsEvaluated: number,
    cartItemCount: number,
    databaseQueries: number = 0,
    hasError: boolean = false
  ): void {
    this.evaluationCount++;
    this.totalEvaluationTime += evaluationTime;
    
    if (hasError) {
      this.errorCount++;
    }

    // Record detailed metrics
    const metrics: PerformanceMetrics = {
      timestamp: Date.now(),
      evaluationTime,
      promotionsEvaluated,
      cartItemCount,
      memoryUsage: process.memoryUsage().heapUsed,
      cacheHitRate: this.getCacheHitRate(),
      databaseQueries,
      errorCount: hasError ? 1 : 0,
    };

    this.metrics.push(metrics);
    
    // Keep only recent metrics
    if (this.metrics.length > this.MAX_METRICS_HISTORY) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS_HISTORY);
    }

    // Log performance warnings immediately
    if (evaluationTime > this.thresholds.evaluationTimeWarning) {
      logger.warn(`Slow promotion evaluation detected: ${evaluationTime}ms for ${promotionsEvaluated} promotions`);
    }
  }

  /**
   * Get current performance statistics
   */
  getPerformanceStats(): {
    averageEvaluationTime: number;
    totalEvaluations: number;
    errorRate: number;
    currentMemoryUsage: number;
    cacheHitRate: number;
    throughput: number; // evaluations per minute
    recentMetrics: PerformanceMetrics[];
  } {
    const recentMetrics = this.getRecentMetrics(300000); // Last 5 minutes
    const averageEvaluationTime = this.evaluationCount > 0 ? 
      this.totalEvaluationTime / this.evaluationCount : 0;
    
    const errorRate = this.evaluationCount > 0 ? 
      (this.errorCount / this.evaluationCount) * 100 : 0;
    
    const throughput = recentMetrics.length > 0 ? 
      (recentMetrics.length / 5) : 0; // per minute over 5 minutes

    return {
      averageEvaluationTime: Math.round(averageEvaluationTime * 100) / 100,
      totalEvaluations: this.evaluationCount,
      errorRate: Math.round(errorRate * 100) / 100,
      currentMemoryUsage: process.memoryUsage().heapUsed,
      cacheHitRate: this.getCacheHitRate(),
      throughput: Math.round(throughput * 100) / 100,
      recentMetrics: recentMetrics.slice(-10), // Last 10 metrics
    };
  }

  /**
   * Get performance trends over time
   */
  getPerformanceTrends(timeRangeMs: number = 3600000): { // Default 1 hour
    evaluationTimeTrend: Array<{ timestamp: number; value: number }>;
    memoryUsageTrend: Array<{ timestamp: number; value: number }>;
    cacheHitRateTrend: Array<{ timestamp: number; value: number }>;
    throughputTrend: Array<{ timestamp: number; value: number }>;
  } {
    const cutoffTime = Date.now() - timeRangeMs;
    const relevantMetrics = this.metrics.filter(m => m.timestamp >= cutoffTime);

    // Group metrics by 5-minute intervals for trends
    const intervalMs = 5 * 60 * 1000; // 5 minutes
    const intervals = new Map<number, PerformanceMetrics[]>();

    relevantMetrics.forEach(metric => {
      const intervalKey = Math.floor(metric.timestamp / intervalMs) * intervalMs;
      if (!intervals.has(intervalKey)) {
        intervals.set(intervalKey, []);
      }
      intervals.get(intervalKey)!.push(metric);
    });

    const evaluationTimeTrend: Array<{ timestamp: number; value: number }> = [];
    const memoryUsageTrend: Array<{ timestamp: number; value: number }> = [];
    const cacheHitRateTrend: Array<{ timestamp: number; value: number }> = [];
    const throughputTrend: Array<{ timestamp: number; value: number }> = [];

    for (const [timestamp, intervalMetrics] of intervals.entries()) {
      const avgEvaluationTime = intervalMetrics.reduce((sum, m) => sum + m.evaluationTime, 0) / intervalMetrics.length;
      const avgMemoryUsage = intervalMetrics.reduce((sum, m) => sum + m.memoryUsage, 0) / intervalMetrics.length;
      const avgCacheHitRate = intervalMetrics.reduce((sum, m) => sum + m.cacheHitRate, 0) / intervalMetrics.length;
      const throughput = intervalMetrics.length / 5; // per minute

      evaluationTimeTrend.push({ timestamp, value: Math.round(avgEvaluationTime * 100) / 100 });
      memoryUsageTrend.push({ timestamp, value: Math.round(avgMemoryUsage) });
      cacheHitRateTrend.push({ timestamp, value: Math.round(avgCacheHitRate * 100) / 100 });
      throughputTrend.push({ timestamp, value: Math.round(throughput * 100) / 100 });
    }

    return {
      evaluationTimeTrend: evaluationTimeTrend.sort((a, b) => a.timestamp - b.timestamp),
      memoryUsageTrend: memoryUsageTrend.sort((a, b) => a.timestamp - b.timestamp),
      cacheHitRateTrend: cacheHitRateTrend.sort((a, b) => a.timestamp - b.timestamp),
      throughputTrend: throughputTrend.sort((a, b) => a.timestamp - b.timestamp),
    };
  }

  /**
   * Get active performance alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter(alert => !alert.resolved);
  }

  /**
   * Get all performance alerts (including resolved)
   */
  getAllAlerts(): PerformanceAlert[] {
    return [...this.alerts].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Resolve a performance alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      logger.info(`Performance alert resolved: ${alertId}`);
      return true;
    }
    return false;
  }

  /**
   * Update performance thresholds
   */
  updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info('Performance thresholds updated', newThresholds);
  }

  /**
   * Get performance recommendations
   */
  getPerformanceRecommendations(): Array<{
    type: 'optimization' | 'configuration' | 'scaling';
    priority: 'low' | 'medium' | 'high';
    recommendation: string;
    reason: string;
    estimatedImpact: string;
  }> {
    const stats = this.getPerformanceStats();
    const cacheStats = promotionCache.getStats();
    const recommendations: Array<any> = [];

    // Evaluation time recommendations
    if (stats.averageEvaluationTime > this.thresholds.evaluationTimeWarning) {
      recommendations.push({
        type: 'optimization',
        priority: stats.averageEvaluationTime > this.thresholds.evaluationTimeCritical ? 'high' : 'medium',
        recommendation: 'Optimize promotion evaluation algorithm',
        reason: `Average evaluation time is ${stats.averageEvaluationTime}ms`,
        estimatedImpact: 'Reduce evaluation time by 30-50%',
      });
    }

    // Cache recommendations
    if (stats.cacheHitRate < this.thresholds.cacheHitRateWarning) {
      recommendations.push({
        type: 'configuration',
        priority: stats.cacheHitRate < this.thresholds.cacheHitRateCritical ? 'high' : 'medium',
        recommendation: 'Increase cache TTL or improve cache strategy',
        reason: `Cache hit rate is only ${stats.cacheHitRate}%`,
        estimatedImpact: 'Improve response time by 20-40%',
      });
    }

    // Memory recommendations
    if (stats.currentMemoryUsage > this.thresholds.memoryUsageWarning) {
      recommendations.push({
        type: 'scaling',
        priority: stats.currentMemoryUsage > this.thresholds.memoryUsageCritical ? 'high' : 'medium',
        recommendation: 'Increase available memory or optimize memory usage',
        reason: `Memory usage is ${Math.round(stats.currentMemoryUsage / 1024 / 1024)}MB`,
        estimatedImpact: 'Prevent memory-related performance degradation',
      });
    }

    // Error rate recommendations
    if (stats.errorRate > this.thresholds.errorRateWarning) {
      recommendations.push({
        type: 'optimization',
        priority: stats.errorRate > this.thresholds.errorRateCritical ? 'high' : 'medium',
        recommendation: 'Investigate and fix promotion evaluation errors',
        reason: `Error rate is ${stats.errorRate}%`,
        estimatedImpact: 'Improve system reliability and user experience',
      });
    }

    // Throughput recommendations
    if (stats.throughput > 100) { // High throughput
      recommendations.push({
        type: 'scaling',
        priority: 'medium',
        recommendation: 'Consider horizontal scaling or load balancing',
        reason: `High throughput detected: ${stats.throughput} evaluations/minute`,
        estimatedImpact: 'Maintain performance under high load',
      });
    }

    // Cache optimization recommendations
    const cacheMetrics = promotionCache.getPerformanceMetrics();
    if (cacheMetrics.memoryPressure > 80) {
      recommendations.push({
        type: 'configuration',
        priority: 'medium',
        recommendation: 'Increase cache size or reduce TTL',
        reason: `Cache memory pressure is ${cacheMetrics.memoryPressure}%`,
        estimatedImpact: 'Reduce cache evictions and improve hit rate',
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(): {
    summary: {
      overallHealth: 'excellent' | 'good' | 'warning' | 'critical';
      keyMetrics: Record<string, any>;
    };
    trends: ReturnType<typeof this.getPerformanceTrends>;
    alerts: PerformanceAlert[];
    recommendations: ReturnType<typeof this.getPerformanceRecommendations>;
    cacheAnalysis: ReturnType<typeof promotionCache.getPerformanceMetrics>;
  } {
    const stats = this.getPerformanceStats();
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.type === 'critical');
    
    // Determine overall health
    let overallHealth: 'excellent' | 'good' | 'warning' | 'critical' = 'excellent';
    
    if (criticalAlerts.length > 0) {
      overallHealth = 'critical';
    } else if (activeAlerts.length > 0) {
      overallHealth = 'warning';
    } else if (
      stats.averageEvaluationTime > this.thresholds.evaluationTimeWarning ||
      stats.cacheHitRate < this.thresholds.cacheHitRateWarning ||
      stats.errorRate > this.thresholds.errorRateWarning
    ) {
      overallHealth = 'good';
    }

    return {
      summary: {
        overallHealth,
        keyMetrics: {
          averageEvaluationTime: `${stats.averageEvaluationTime}ms`,
          cacheHitRate: `${stats.cacheHitRate}%`,
          errorRate: `${stats.errorRate}%`,
          throughput: `${stats.throughput}/min`,
          memoryUsage: `${Math.round(stats.currentMemoryUsage / 1024 / 1024)}MB`,
        },
      },
      trends: this.getPerformanceTrends(),
      alerts: activeAlerts,
      recommendations: this.getPerformanceRecommendations(),
      cacheAnalysis: promotionCache.getPerformanceMetrics(),
    };
  }

  /**
   * Collect current performance metrics
   */
  private collectMetrics(): void {
    const memoryUsage = process.memoryUsage().heapUsed;
    const cacheHitRate = this.getCacheHitRate();
    
    // Create a synthetic metric for monitoring
    const metrics: PerformanceMetrics = {
      timestamp: Date.now(),
      evaluationTime: 0, // Will be updated by actual evaluations
      promotionsEvaluated: 0,
      cartItemCount: 0,
      memoryUsage,
      cacheHitRate,
      databaseQueries: 0,
      errorCount: 0,
    };

    // Don't add to metrics array as this is just for monitoring
    logger.debug('Performance metrics collected', {
      memoryUsage: Math.round(memoryUsage / 1024 / 1024) + 'MB',
      cacheHitRate: cacheHitRate + '%',
    });
  }

  /**
   * Check performance thresholds and create alerts
   */
  private checkThresholds(): void {
    const stats = this.getPerformanceStats();
    const now = Date.now();

    // Check evaluation time
    if (stats.averageEvaluationTime > this.thresholds.evaluationTimeCritical) {
      this.createAlert('critical', 'evaluationTime', this.thresholds.evaluationTimeCritical, 
        stats.averageEvaluationTime, 'Critical: Promotion evaluation time is too high');
    } else if (stats.averageEvaluationTime > this.thresholds.evaluationTimeWarning) {
      this.createAlert('warning', 'evaluationTime', this.thresholds.evaluationTimeWarning, 
        stats.averageEvaluationTime, 'Warning: Promotion evaluation time is elevated');
    }

    // Check memory usage
    if (stats.currentMemoryUsage > this.thresholds.memoryUsageCritical) {
      this.createAlert('critical', 'memoryUsage', this.thresholds.memoryUsageCritical, 
        stats.currentMemoryUsage, 'Critical: Memory usage is too high');
    } else if (stats.currentMemoryUsage > this.thresholds.memoryUsageWarning) {
      this.createAlert('warning', 'memoryUsage', this.thresholds.memoryUsageWarning, 
        stats.currentMemoryUsage, 'Warning: Memory usage is elevated');
    }

    // Check cache hit rate
    if (stats.cacheHitRate < this.thresholds.cacheHitRateCritical) {
      this.createAlert('critical', 'cacheHitRate', this.thresholds.cacheHitRateCritical, 
        stats.cacheHitRate, 'Critical: Cache hit rate is too low');
    } else if (stats.cacheHitRate < this.thresholds.cacheHitRateWarning) {
      this.createAlert('warning', 'cacheHitRate', this.thresholds.cacheHitRateWarning, 
        stats.cacheHitRate, 'Warning: Cache hit rate is low');
    }

    // Check error rate
    if (stats.errorRate > this.thresholds.errorRateCritical) {
      this.createAlert('critical', 'errorRate', this.thresholds.errorRateCritical, 
        stats.errorRate, 'Critical: Error rate is too high');
    } else if (stats.errorRate > this.thresholds.errorRateWarning) {
      this.createAlert('warning', 'errorRate', this.thresholds.errorRateWarning, 
        stats.errorRate, 'Warning: Error rate is elevated');
    }
  }

  /**
   * Create a performance alert
   */
  private createAlert(
    type: 'warning' | 'critical',
    metric: string,
    threshold: number,
    currentValue: number,
    message: string
  ): void {
    const alertKey = `${type}-${metric}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey) || 0;
    const now = Date.now();

    // Respect cooldown period
    if (now - lastAlertTime < this.ALERT_COOLDOWN_MS) {
      return;
    }

    const alert: PerformanceAlert = {
      id: `${alertKey}-${now}`,
      type,
      metric,
      threshold,
      currentValue,
      message,
      timestamp: now,
      resolved: false,
    };

    this.alerts.push(alert);
    this.lastAlertTimes.set(alertKey, now);

    // Log the alert
    const logLevel = type === 'critical' ? 'error' : 'warn';
    logger[logLevel](`Performance alert: ${message}`, {
      metric,
      threshold,
      currentValue,
      alertId: alert.id,
    });

    // Keep only recent alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
  }

  /**
   * Get cache hit rate from promotion cache
   */
  private getCacheHitRate(): number {
    const cacheStats = promotionCache.getStats();
    return cacheStats.hitRate;
  }

  /**
   * Get recent metrics within specified time range
   */
  private getRecentMetrics(timeRangeMs: number): PerformanceMetrics[] {
    const cutoffTime = Date.now() - timeRangeMs;
    return this.metrics.filter(m => m.timestamp >= cutoffTime);
  }

  /**
   * Clean up old data to prevent memory leaks
   */
  private cleanupOldData(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours

    // Clean old metrics
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoffTime);

    // Clean old resolved alerts
    this.alerts = this.alerts.filter(a => 
      !a.resolved || a.timestamp >= cutoffTime
    );

    // Clean old alert times
    for (const [key, time] of this.lastAlertTimes.entries()) {
      if (time < cutoffTime) {
        this.lastAlertTimes.delete(key);
      }
    }
  }
}

// Singleton instance
export const promotionPerformanceMonitor = new PromotionPerformanceMonitor();