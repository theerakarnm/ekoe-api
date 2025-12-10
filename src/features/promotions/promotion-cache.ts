/**
 * Promotion Caching System for Performance Optimization
 * 
 * Task 12.3: Performance optimization and monitoring
 * - Implement caching strategies for frequently accessed promotions
 * - Optimize promotion evaluation performance for large catalogs
 * 
 * Requirements: Performance and scalability
 */

import { logger } from '../../core/logger';
import type { Promotion, PromotionRule } from './promotions.interface';

/**
 * Cache entry interface
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  accessCount: number;
  lastAccessed: number;
}

/**
 * Cache statistics interface
 */
interface CacheStats {
  hits: number;
  misses: number;
  entries: number;
  hitRate: number;
  memoryUsage: number;
  oldestEntry: number;
  newestEntry: number;
}

/**
 * Promotion caching service for performance optimization
 */
export class PromotionCache {
  private activePromotionsCache = new Map<string, CacheEntry<Promotion[]>>();
  private promotionRulesCache = new Map<string, CacheEntry<PromotionRule[]>>();
  private promotionCache = new Map<string, CacheEntry<Promotion>>();
  
  // Cache configuration
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly ACTIVE_PROMOTIONS_TTL = 2 * 60 * 1000; // 2 minutes for active promotions
  private readonly PROMOTION_RULES_TTL = 10 * 60 * 1000; // 10 minutes for rules
  private readonly MAX_CACHE_SIZE = 1000; // Maximum number of entries per cache
  
  // Statistics
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    memoryCleanups: 0,
  };

  /**
   * Get cached active promotions
   */
  getActivePromotions(): Promotion[] | null {
    const cacheKey = 'active_promotions';
    const entry = this.activePromotionsCache.get(cacheKey);
    
    if (entry && this.isEntryValid(entry)) {
      this.updateAccessStats(entry);
      this.stats.hits++;
      logger.debug('Cache hit for active promotions');
      return entry.data;
    }
    
    this.stats.misses++;
    logger.debug('Cache miss for active promotions');
    return null;
  }

  /**
   * Cache active promotions
   */
  setActivePromotions(promotions: Promotion[]): void {
    const cacheKey = 'active_promotions';
    const entry: CacheEntry<Promotion[]> = {
      data: promotions,
      timestamp: Date.now(),
      ttl: this.ACTIVE_PROMOTIONS_TTL,
      accessCount: 0,
      lastAccessed: Date.now(),
    };
    
    this.activePromotionsCache.set(cacheKey, entry);
    logger.debug(`Cached ${promotions.length} active promotions`);
  }

  /**
   * Get cached promotion rules
   */
  getPromotionRules(promotionId: string): PromotionRule[] | null {
    const entry = this.promotionRulesCache.get(promotionId);
    
    if (entry && this.isEntryValid(entry)) {
      this.updateAccessStats(entry);
      this.stats.hits++;
      logger.debug(`Cache hit for promotion rules: ${promotionId}`);
      return entry.data;
    }
    
    this.stats.misses++;
    logger.debug(`Cache miss for promotion rules: ${promotionId}`);
    return null;
  }

  /**
   * Cache promotion rules
   */
  setPromotionRules(promotionId: string, rules: PromotionRule[]): void {
    const entry: CacheEntry<PromotionRule[]> = {
      data: rules,
      timestamp: Date.now(),
      ttl: this.PROMOTION_RULES_TTL,
      accessCount: 0,
      lastAccessed: Date.now(),
    };
    
    this.promotionRulesCache.set(promotionId, entry);
    this.enforceMaxCacheSize(this.promotionRulesCache);
    logger.debug(`Cached ${rules.length} rules for promotion: ${promotionId}`);
  }

  /**
   * Get cached promotion
   */
  getPromotion(promotionId: string): Promotion | null {
    const entry = this.promotionCache.get(promotionId);
    
    if (entry && this.isEntryValid(entry)) {
      this.updateAccessStats(entry);
      this.stats.hits++;
      logger.debug(`Cache hit for promotion: ${promotionId}`);
      return entry.data;
    }
    
    this.stats.misses++;
    logger.debug(`Cache miss for promotion: ${promotionId}`);
    return null;
  }

  /**
   * Cache promotion
   */
  setPromotion(promotion: Promotion): void {
    const entry: CacheEntry<Promotion> = {
      data: promotion,
      timestamp: Date.now(),
      ttl: this.DEFAULT_TTL,
      accessCount: 0,
      lastAccessed: Date.now(),
    };
    
    this.promotionCache.set(promotion.id, entry);
    this.enforceMaxCacheSize(this.promotionCache);
    logger.debug(`Cached promotion: ${promotion.id}`);
  }

  /**
   * Invalidate cache entries for a specific promotion
   */
  invalidatePromotion(promotionId: string): void {
    this.promotionCache.delete(promotionId);
    this.promotionRulesCache.delete(promotionId);
    
    // Also invalidate active promotions cache since it might contain this promotion
    this.activePromotionsCache.clear();
    
    logger.debug(`Invalidated cache for promotion: ${promotionId}`);
  }

  /**
   * Invalidate all active promotions cache
   */
  invalidateActivePromotions(): void {
    this.activePromotionsCache.clear();
    logger.debug('Invalidated active promotions cache');
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.activePromotionsCache.clear();
    this.promotionRulesCache.clear();
    this.promotionCache.clear();
    
    // Reset statistics
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      memoryCleanups: 0,
    };
    
    logger.info('Cleared all promotion caches');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { evictions: number; memoryCleanups: number } {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    
    const allEntries = [
      ...this.activePromotionsCache.values(),
      ...this.promotionRulesCache.values(),
      ...this.promotionCache.values(),
    ];
    
    const memoryUsage = this.estimateMemoryUsage();
    const timestamps = allEntries.map(entry => entry.timestamp);
    
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      entries: allEntries.length,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsage,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : 0,
      evictions: this.stats.evictions,
      memoryCleanups: this.stats.memoryCleanups,
    };
  }

  /**
   * Perform cache maintenance (cleanup expired entries)
   */
  performMaintenance(): void {
    const startTime = Date.now();
    let cleanedEntries = 0;

    // Clean expired entries from all caches
    cleanedEntries += this.cleanExpiredEntries(this.activePromotionsCache);
    cleanedEntries += this.cleanExpiredEntries(this.promotionRulesCache);
    cleanedEntries += this.cleanExpiredEntries(this.promotionCache);

    const maintenanceTime = Date.now() - startTime;
    
    if (cleanedEntries > 0) {
      this.stats.memoryCleanups++;
      logger.debug(`Cache maintenance completed: cleaned ${cleanedEntries} entries in ${maintenanceTime}ms`);
    }
  }

  /**
   * Get cache performance metrics for monitoring
   */
  getPerformanceMetrics(): {
    hitRate: number;
    averageAccessCount: number;
    cacheEfficiency: number;
    memoryPressure: number;
    stalenessRatio: number;
  } {
    const stats = this.getStats();
    const allEntries = [
      ...this.activePromotionsCache.values(),
      ...this.promotionRulesCache.values(),
      ...this.promotionCache.values(),
    ];

    const totalAccessCount = allEntries.reduce((sum, entry) => sum + entry.accessCount, 0);
    const averageAccessCount = allEntries.length > 0 ? totalAccessCount / allEntries.length : 0;

    // Calculate cache efficiency (hit rate weighted by access frequency)
    const cacheEfficiency = stats.hitRate * (averageAccessCount / 10); // Normalize to 0-100 scale

    // Calculate memory pressure (percentage of max cache size used)
    const maxTotalEntries = this.MAX_CACHE_SIZE * 3; // 3 caches
    const memoryPressure = (stats.entries / maxTotalEntries) * 100;

    // Calculate staleness ratio (percentage of entries near expiration)
    const now = Date.now();
    const staleEntries = allEntries.filter(entry => {
      const age = now - entry.timestamp;
      const staleThreshold = entry.ttl * 0.8; // 80% of TTL
      return age > staleThreshold;
    }).length;
    const stalenessRatio = allEntries.length > 0 ? (staleEntries / allEntries.length) * 100 : 0;

    return {
      hitRate: stats.hitRate,
      averageAccessCount: Math.round(averageAccessCount * 100) / 100,
      cacheEfficiency: Math.round(cacheEfficiency * 100) / 100,
      memoryPressure: Math.round(memoryPressure * 100) / 100,
      stalenessRatio: Math.round(stalenessRatio * 100) / 100,
    };
  }

  /**
   * Optimize cache configuration based on usage patterns
   */
  optimizeConfiguration(): {
    recommendedTTL: Record<string, number>;
    recommendedMaxSize: number;
    optimizationReasons: string[];
  } {
    const metrics = this.getPerformanceMetrics();
    const stats = this.getStats();
    const reasons: string[] = [];
    
    let recommendedActivePromotionsTTL = this.ACTIVE_PROMOTIONS_TTL;
    let recommendedRulesTTL = this.PROMOTION_RULES_TTL;
    let recommendedPromotionTTL = this.DEFAULT_TTL;
    let recommendedMaxSize = this.MAX_CACHE_SIZE;

    // Adjust TTL based on hit rate
    if (metrics.hitRate < 50) {
      // Low hit rate - increase TTL to keep entries longer
      recommendedActivePromotionsTTL *= 1.5;
      recommendedRulesTTL *= 1.5;
      recommendedPromotionTTL *= 1.5;
      reasons.push('Increased TTL due to low hit rate');
    } else if (metrics.hitRate > 90) {
      // Very high hit rate - can reduce TTL to keep data fresher
      recommendedActivePromotionsTTL *= 0.8;
      recommendedRulesTTL *= 0.8;
      recommendedPromotionTTL *= 0.8;
      reasons.push('Reduced TTL due to high hit rate');
    }

    // Adjust cache size based on memory pressure
    if (metrics.memoryPressure > 80) {
      recommendedMaxSize = Math.floor(this.MAX_CACHE_SIZE * 0.8);
      reasons.push('Reduced cache size due to high memory pressure');
    } else if (metrics.memoryPressure < 30 && metrics.hitRate > 70) {
      recommendedMaxSize = Math.floor(this.MAX_CACHE_SIZE * 1.2);
      reasons.push('Increased cache size due to low memory pressure and good hit rate');
    }

    // Adjust based on staleness
    if (metrics.stalenessRatio > 60) {
      recommendedActivePromotionsTTL *= 0.7;
      recommendedRulesTTL *= 0.7;
      recommendedPromotionTTL *= 0.7;
      reasons.push('Reduced TTL due to high staleness ratio');
    }

    return {
      recommendedTTL: {
        activePromotions: Math.round(recommendedActivePromotionsTTL),
        promotionRules: Math.round(recommendedRulesTTL),
        promotion: Math.round(recommendedPromotionTTL),
      },
      recommendedMaxSize,
      optimizationReasons: reasons,
    };
  }

  /**
   * Check if cache entry is valid (not expired)
   */
  private isEntryValid<T>(entry: CacheEntry<T>): boolean {
    const age = Date.now() - entry.timestamp;
    return age < entry.ttl;
  }

  /**
   * Update access statistics for cache entry
   */
  private updateAccessStats<T>(entry: CacheEntry<T>): void {
    entry.accessCount++;
    entry.lastAccessed = Date.now();
  }

  /**
   * Enforce maximum cache size by evicting least recently used entries
   */
  private enforceMaxCacheSize<T>(cache: Map<string, CacheEntry<T>>): void {
    if (cache.size <= this.MAX_CACHE_SIZE) {
      return;
    }

    // Sort entries by last accessed time (LRU eviction)
    const entries = Array.from(cache.entries()).sort((a, b) => 
      a[1].lastAccessed - b[1].lastAccessed
    );

    // Remove oldest entries until we're under the limit
    const entriesToRemove = cache.size - this.MAX_CACHE_SIZE;
    for (let i = 0; i < entriesToRemove; i++) {
      cache.delete(entries[i][0]);
      this.stats.evictions++;
    }

    logger.debug(`Evicted ${entriesToRemove} entries from cache (LRU policy)`);
  }

  /**
   * Clean expired entries from a cache
   */
  private cleanExpiredEntries<T>(cache: Map<string, CacheEntry<T>>): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of cache.entries()) {
      if (!this.isEntryValid(entry)) {
        cache.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Estimate memory usage of all caches
   */
  private estimateMemoryUsage(): number {
    // Rough estimation of memory usage in bytes
    let totalSize = 0;

    // Estimate size of each cache
    totalSize += this.estimateCacheSize(this.activePromotionsCache);
    totalSize += this.estimateCacheSize(this.promotionRulesCache);
    totalSize += this.estimateCacheSize(this.promotionCache);

    return totalSize;
  }

  /**
   * Estimate memory usage of a specific cache
   */
  private estimateCacheSize<T>(cache: Map<string, CacheEntry<T>>): number {
    let size = 0;
    
    for (const [key, entry] of cache.entries()) {
      // Estimate key size
      size += key.length * 2; // UTF-16 characters
      
      // Estimate entry overhead
      size += 64; // Rough estimate for CacheEntry metadata
      
      // Estimate data size (rough approximation)
      size += JSON.stringify(entry.data).length * 2;
    }
    
    return size;
  }
}

// Singleton instance
export const promotionCache = new PromotionCache();

// Start periodic maintenance
setInterval(() => {
  promotionCache.performMaintenance();
}, 5 * 60 * 1000); // Every 5 minutes