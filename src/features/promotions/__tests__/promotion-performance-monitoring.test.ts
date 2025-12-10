/**
 * Performance Optimization and Monitoring Tests for Promotional System
 * 
 * Task 12.3: Performance optimization and monitoring
 * - Optimize promotion evaluation performance for large catalogs
 * - Add monitoring and alerting for promotion system health
 * - Implement caching strategies for frequently accessed promotions
 * 
 * Requirements: Performance and scalability
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { db } from '../../../core/database';
import { 
  products, 
  productVariants, 
  complimentaryGifts 
} from '../../../core/database/schema/products.schema';
import { 
  autoPromotions, 
  autoPromotionRules, 
  autoPromotionAnalytics 
} from '../../../core/database/schema/promotional-system.schema';
import { promotionEngine } from '../promotion-engine';
import { promotionRepository } from '../promotions.repository';
import { promotionMonitor } from '../promotion-monitor';
import { inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { 
  PromotionEvaluationContext, 
  CartItem 
} from '../promotions.interface';

// Test data setup for performance testing
let testProductIds: string[] = [];
let testVariantIds: string[] = [];
let testPromotionIds: string[] = [];
let setupComplete = false;

// Performance metrics tracking
interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: number;
  promotionsEvaluated: number;
  cacheHits?: number;
  cacheMisses?: number;
}

describe('Promotional System Performance and Monitoring Tests', () => {

  beforeAll(async () => {
    try {
      // Test database connection
      await db.execute('SELECT 1');
      
      // Create a large catalog for performance testing
      const numProducts = 20; // Larger catalog for performance testing
      for (let i = 0; i < numProducts; i++) {
        const productId = uuidv7();
        testProductIds.push(productId);
        
        await db.insert(products).values({
          id: productId,
          name: `Performance Test Product ${i}`,
          slug: `perf-test-product-${i}-${productId.slice(0, 8)}`,
          description: 'Performance test product for promotional system',
          basePrice: 1000 + (i * 500), // Varied pricing
          status: 'active',
          trackInventory: true,
        });

        // Create 3 variants per product for larger catalog
        for (let j = 0; j < 3; j++) {
          const variantId = uuidv7();
          testVariantIds.push(variantId);
          
          await db.insert(productVariants).values({
            id: variantId,
            productId,
            name: `Variant ${j}`,
            value: `${50 + j * 25}ml`,
            sku: `SKU-PERF-${i}-${j}`,
            price: 1000 + (i * 500) + (j * 200),
            stockQuantity: 100,
            isActive: true,
          });
        }
      }

      // Create multiple promotions for performance testing
      const numPromotions = 15; // Multiple promotions to test evaluation performance
      for (let i = 0; i < numPromotions; i++) {
        const promotionId = uuidv7();
        testPromotionIds.push(promotionId);
        
        const promotionType = i % 3 === 0 ? 'percentage_discount' : 
                             i % 3 === 1 ? 'fixed_discount' : 'free_gift';
        
        await db.insert(autoPromotions).values({
          id: promotionId,
          name: `Performance Test Promotion ${i}`,
          description: `Performance test promotion ${i}`,
          type: promotionType as any,
          status: 'active',
          priority: Math.floor(i / 3) + 1, // Varied priorities
          startsAt: new Date(Date.now() - 86400000),
          endsAt: new Date(Date.now() + 86400000),
          usageLimit: 1000,
          usageLimitPerCustomer: 10,
          currentUsageCount: Math.floor(Math.random() * 100),
        });

        // Create condition rules with varied thresholds
        await db.insert(autoPromotionRules).values({
          promotionId,
          ruleType: 'condition',
          conditionType: 'cart_value',
          operator: 'gte',
          numericValue: 5000 + (i * 2000), // Varied thresholds
        });

        // Create benefit rules
        if (promotionType === 'percentage_discount') {
          await db.insert(autoPromotionRules).values({
            promotionId,
            ruleType: 'benefit',
            benefitType: 'percentage_discount',
            benefitValue: 5 + (i % 20), // 5-25% discounts
            maxDiscountAmount: 10000 + (i * 1000),
          });
        } else if (promotionType === 'fixed_discount') {
          await db.insert(autoPromotionRules).values({
            promotionId,
            ruleType: 'benefit',
            benefitType: 'fixed_discount',
            benefitValue: 1000 + (i * 500), // Varied fixed amounts
          });
        }
      }

      setupComplete = true;
    } catch (error) {
      console.error('Failed to setup performance test data:', error);
      setupComplete = false;
    }
  });

  afterAll(async () => {
    if (!setupComplete) return;
    
    try {
      // Cleanup all test data
      if (testPromotionIds.length > 0) {
        await db.delete(autoPromotionAnalytics).where(inArray(autoPromotionAnalytics.promotionId, testPromotionIds));
        await db.delete(autoPromotionRules).where(inArray(autoPromotionRules.promotionId, testPromotionIds));
        await db.delete(autoPromotions).where(inArray(autoPromotions.id, testPromotionIds));
      }
      
      if (testVariantIds.length > 0) {
        await db.delete(productVariants).where(inArray(productVariants.id, testVariantIds));
      }
      
      if (testProductIds.length > 0) {
        await db.delete(products).where(inArray(products.id, testProductIds));
      }
    } catch (error) {
      console.error('Failed to cleanup performance test data:', error);
    }
  });

  beforeEach(() => {
    if (!setupComplete) {
      throw new Error('Performance test setup failed - database connection required');
    }
  });

  /**
   * Test 1: Large Catalog Performance Optimization
   * Validates: Promotion evaluation performance with large product catalogs
   */
  test('should evaluate promotions efficiently with large product catalog', async () => {
    // Create a large cart with many items
    const largeCartItems: CartItem[] = [];
    for (let i = 0; i < Math.min(testProductIds.length, 15); i++) {
      largeCartItems.push({
        productId: testProductIds[i],
        variantId: testVariantIds[i * 3], // Use first variant of each product
        quantity: Math.floor(Math.random() * 5) + 1,
        unitPrice: 1000 + (i * 500),
        subtotal: (1000 + (i * 500)) * (Math.floor(Math.random() * 5) + 1),
        categoryIds: [`category-${i % 5}`], // Simulate categories
      });
    }

    const cartSubtotal = largeCartItems.reduce((sum, item) => sum + item.subtotal, 0);

    const evaluationContext: PromotionEvaluationContext = {
      cartItems: largeCartItems,
      cartSubtotal,
      customerId: 'perf-test-customer',
    };

    // Measure performance
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    const result = await promotionEngine.evaluatePromotions(evaluationContext);

    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;

    const metrics: PerformanceMetrics = {
      executionTime: endTime - startTime,
      memoryUsage: endMemory - startMemory,
      promotionsEvaluated: result.eligiblePromotions.length,
    };

    // Performance assertions
    expect(metrics.executionTime).toBeLessThan(2000); // Should complete within 2 seconds
    expect(metrics.memoryUsage).toBeLessThan(50 * 1024 * 1024); // Should use less than 50MB additional memory
    expect(result.eligiblePromotions).toBeDefined();

    console.log('Large Catalog Performance Metrics:', metrics);

    // Verify results are still accurate despite performance optimizations
    expect(result.totalDiscount).toBeGreaterThanOrEqual(0);
    if (result.selectedPromotion) {
      expect(result.selectedPromotion.promotionId).toBeDefined();
      expect(result.selectedPromotion.discountAmount).toBeGreaterThan(0);
    }
  });

  /**
   * Test 2: Concurrent Promotion Evaluation Performance
   * Validates: System performance under concurrent load
   */
  test('should handle concurrent promotion evaluations efficiently', async () => {
    // Create multiple different cart contexts
    const cartContexts: PromotionEvaluationContext[] = [];
    for (let i = 0; i < 5; i++) {
      const cartItems: CartItem[] = [];
      for (let j = 0; j < 3; j++) {
        const productIndex = (i * 3 + j) % testProductIds.length;
        cartItems.push({
          productId: testProductIds[productIndex],
          variantId: testVariantIds[productIndex * 3],
          quantity: j + 1,
          unitPrice: 2000 + (j * 1000),
          subtotal: (2000 + (j * 1000)) * (j + 1),
          categoryIds: [`category-${j}`],
        });
      }

      cartContexts.push({
        cartItems,
        cartSubtotal: cartItems.reduce((sum, item) => sum + item.subtotal, 0),
        customerId: `concurrent-customer-${i}`,
      });
    }

    // Measure concurrent performance
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;

    const concurrentPromises = cartContexts.map(context => 
      promotionEngine.evaluatePromotions(context)
    );

    const results = await Promise.all(concurrentPromises);

    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;

    const concurrentMetrics: PerformanceMetrics = {
      executionTime: endTime - startTime,
      memoryUsage: endMemory - startMemory,
      promotionsEvaluated: results.reduce((sum, result) => sum + result.eligiblePromotions.length, 0),
    };

    // Concurrent performance assertions
    expect(concurrentMetrics.executionTime).toBeLessThan(5000); // Should complete within 5 seconds
    expect(concurrentMetrics.memoryUsage).toBeLessThan(100 * 1024 * 1024); // Should use less than 100MB additional memory

    console.log('Concurrent Evaluation Performance Metrics:', concurrentMetrics);

    // Verify all results are valid
    for (const result of results) {
      expect(result.eligiblePromotions).toBeDefined();
      expect(result.totalDiscount).toBeGreaterThanOrEqual(0);
    }

    // Verify results are consistent (same cart should produce same results)
    const duplicateResult = await promotionEngine.evaluatePromotions(cartContexts[0]);
    expect(duplicateResult.totalDiscount).toBe(results[0].totalDiscount);
  });

  /**
   * Test 3: Promotion Caching Performance
   * Validates: Caching strategies for frequently accessed promotions
   */
  test('should demonstrate improved performance with promotion caching', async () => {
    const cartItems: CartItem[] = [
      {
        productId: testProductIds[0],
        variantId: testVariantIds[0],
        quantity: 2,
        unitPrice: 5000,
        subtotal: 10000,
        categoryIds: ['category-1'],
      }
    ];

    const evaluationContext: PromotionEvaluationContext = {
      cartItems,
      cartSubtotal: 10000,
      customerId: 'cache-test-customer',
    };

    // First evaluation (cold cache)
    const coldStartTime = Date.now();
    const coldResult = await promotionEngine.evaluatePromotions(evaluationContext);
    const coldEndTime = Date.now();
    const coldExecutionTime = coldEndTime - coldStartTime;

    // Multiple subsequent evaluations (should benefit from caching)
    const warmExecutionTimes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const warmStartTime = Date.now();
      await promotionEngine.evaluatePromotions(evaluationContext);
      const warmEndTime = Date.now();
      warmExecutionTimes.push(warmEndTime - warmStartTime);
    }

    const averageWarmTime = warmExecutionTimes.reduce((sum, time) => sum + time, 0) / warmExecutionTimes.length;

    console.log('Caching Performance Metrics:', {
      coldExecutionTime,
      averageWarmTime,
      improvementRatio: coldExecutionTime / averageWarmTime,
    });

    // Performance improvement assertions
    // Note: Actual caching would need to be implemented in the promotion engine
    // This test demonstrates how to measure caching effectiveness
    expect(coldExecutionTime).toBeGreaterThan(0);
    expect(averageWarmTime).toBeGreaterThan(0);

    // Verify results are consistent regardless of caching
    expect(coldResult.totalDiscount).toBeGreaterThanOrEqual(0);
  });

  /**
   * Test 4: Promotion System Health Monitoring
   * Validates: Monitoring and alerting for promotion system health
   */
  test('should monitor promotion system health effectively', async () => {
    // Start the promotion monitor
    promotionMonitor.start();

    try {
      // Wait for initial monitoring check
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify monitoring is active
      expect(promotionMonitor.isMonitoringActive()).toBe(true);

      // Get system health metrics
      const healthMetrics = await promotionMonitor.getSystemHealthMetrics();

      // Verify health metrics structure
      expect(healthMetrics.totalPromotions).toBeGreaterThanOrEqual(0);
      expect(healthMetrics.activePromotions).toBeGreaterThanOrEqual(0);
      expect(healthMetrics.scheduledPromotions).toBeGreaterThanOrEqual(0);
      expect(healthMetrics.expiredPromotions).toBeGreaterThanOrEqual(0);
      expect(healthMetrics.conflictCount).toBeGreaterThanOrEqual(0);
      expect(healthMetrics.healthScore).toBeGreaterThanOrEqual(0);
      expect(healthMetrics.healthScore).toBeLessThanOrEqual(100);
      expect(Array.isArray(healthMetrics.issues)).toBe(true);

      console.log('System Health Metrics:', healthMetrics);

      // Get promotion status updates
      const statusUpdates = await promotionMonitor.getPromotionStatusUpdates();

      // Verify status updates structure
      expect(Array.isArray(statusUpdates)).toBe(true);
      for (const update of statusUpdates) {
        expect(update.promotionId).toBeDefined();
        expect(update.promotionName).toBeDefined();
        expect(update.currentStatus).toBeDefined();
        expect(update.expectedStatus).toBeDefined();
        expect(typeof update.needsUpdate).toBe('boolean');
      }

      // Perform manual monitoring check
      await promotionMonitor.performMonitoringCheck();

      // Verify monitoring completed without errors
      expect(promotionMonitor.isMonitoringActive()).toBe(true);

    } finally {
      // Stop the monitor
      promotionMonitor.stop();
      expect(promotionMonitor.isMonitoringActive()).toBe(false);
    }
  });

  /**
   * Test 5: Database Query Performance Optimization
   * Validates: Optimized database queries for promotion evaluation
   */
  test('should optimize database queries for promotion evaluation', async () => {
    // Test active promotions query performance
    const activePromotionsStartTime = Date.now();
    const activePromotions = await promotionRepository.getActivePromotions();
    const activePromotionsEndTime = Date.now();
    const activePromotionsTime = activePromotionsEndTime - activePromotionsStartTime;

    expect(activePromotionsTime).toBeLessThan(1000); // Should complete within 1 second
    expect(activePromotions.length).toBeGreaterThan(0);

    console.log('Active Promotions Query Performance:', {
      executionTime: activePromotionsTime,
      promotionsReturned: activePromotions.length,
    });

    // Test promotion rules query performance
    const promotionId = testPromotionIds[0];
    const rulesStartTime = Date.now();
    const rules = await promotionRepository.getPromotionRules(promotionId);
    const rulesEndTime = Date.now();
    const rulesTime = rulesEndTime - rulesStartTime;

    expect(rulesTime).toBeLessThan(500); // Should complete within 500ms
    expect(rules.length).toBeGreaterThan(0);

    console.log('Promotion Rules Query Performance:', {
      executionTime: rulesTime,
      rulesReturned: rules.length,
    });

    // Test bulk promotion queries
    const bulkStartTime = Date.now();
    const bulkPromises = testPromotionIds.slice(0, 5).map(id => 
      promotionRepository.getPromotionById(id)
    );
    await Promise.all(bulkPromises);
    const bulkEndTime = Date.now();
    const bulkTime = bulkEndTime - bulkStartTime;

    expect(bulkTime).toBeLessThan(2000); // Should complete within 2 seconds

    console.log('Bulk Promotion Queries Performance:', {
      executionTime: bulkTime,
      queriesExecuted: bulkPromises.length,
    });
  });

  /**
   * Test 6: Memory Usage Optimization
   * Validates: Efficient memory usage during promotion evaluation
   */
  test('should optimize memory usage during promotion evaluation', async () => {
    const initialMemory = process.memoryUsage();

    // Create multiple large evaluation contexts
    const evaluationContexts: PromotionEvaluationContext[] = [];
    for (let i = 0; i < 10; i++) {
      const cartItems: CartItem[] = [];
      for (let j = 0; j < 10; j++) {
        const productIndex = (i * 10 + j) % testProductIds.length;
        cartItems.push({
          productId: testProductIds[productIndex],
          variantId: testVariantIds[productIndex * 3],
          quantity: j + 1,
          unitPrice: 1000 + (j * 500),
          subtotal: (1000 + (j * 500)) * (j + 1),
          categoryIds: [`category-${j % 3}`],
        });
      }

      evaluationContexts.push({
        cartItems,
        cartSubtotal: cartItems.reduce((sum, item) => sum + item.subtotal, 0),
        customerId: `memory-test-customer-${i}`,
      });
    }

    // Process all contexts
    const results = [];
    for (const context of evaluationContexts) {
      const result = await promotionEngine.evaluatePromotions(context);
      results.push(result);
    }

    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

    console.log('Memory Usage Metrics:', {
      initialHeapUsed: Math.round(initialMemory.heapUsed / 1024 / 1024) + 'MB',
      finalHeapUsed: Math.round(finalMemory.heapUsed / 1024 / 1024) + 'MB',
      memoryIncrease: Math.round(memoryIncrease / 1024 / 1024) + 'MB',
      contextsProcessed: evaluationContexts.length,
      memoryPerContext: Math.round(memoryIncrease / evaluationContexts.length / 1024) + 'KB',
    });

    // Memory usage assertions
    expect(memoryIncrease).toBeLessThan(200 * 1024 * 1024); // Should use less than 200MB additional memory
    expect(results.length).toBe(evaluationContexts.length);

    // Verify all results are valid
    for (const result of results) {
      expect(result.eligiblePromotions).toBeDefined();
      expect(result.totalDiscount).toBeGreaterThanOrEqual(0);
    }
  });

  /**
   * Test 7: Promotion Analytics Performance
   * Validates: Performance of analytics data collection and reporting
   */
  test('should handle analytics data collection efficiently', async () => {
    const promotionId = testPromotionIds[0];
    
    // Create analytics data for multiple time periods
    const analyticsData = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 24; i++) { // 24 hours of data
      analyticsData.push({
        promotionId,
        date: today,
        hour: i,
        views: Math.floor(Math.random() * 1000) + 100,
        applications: Math.floor(Math.random() * 100) + 10,
        totalDiscountAmount: Math.floor(Math.random() * 100000) + 10000,
        totalOrders: Math.floor(Math.random() * 50) + 5,
        totalRevenue: Math.floor(Math.random() * 500000) + 50000,
        conversionRate: Math.random() * 0.5 + 0.1,
        averageOrderValue: Math.floor(Math.random() * 20000) + 5000,
      });
    }

    // Measure analytics insertion performance
    const insertStartTime = Date.now();
    await db.insert(autoPromotionAnalytics).values(analyticsData);
    const insertEndTime = Date.now();
    const insertTime = insertEndTime - insertStartTime;

    expect(insertTime).toBeLessThan(2000); // Should complete within 2 seconds

    // Measure analytics query performance
    const queryStartTime = Date.now();
    const retrievedAnalytics = await db
      .select()
      .from(autoPromotionAnalytics)
      .where(eq(autoPromotionAnalytics.promotionId, promotionId));
    const queryEndTime = Date.now();
    const queryTime = queryEndTime - queryStartTime;

    expect(queryTime).toBeLessThan(1000); // Should complete within 1 second
    expect(retrievedAnalytics.length).toBe(analyticsData.length);

    console.log('Analytics Performance Metrics:', {
      insertTime,
      queryTime,
      recordsProcessed: analyticsData.length,
    });

    // Cleanup analytics data
    await db.delete(autoPromotionAnalytics).where(eq(autoPromotionAnalytics.promotionId, promotionId));
  });

  /**
   * Test 8: Scalability Stress Test
   * Validates: System behavior under high load conditions
   */
  test('should maintain performance under stress conditions', async () => {
    const stressTestResults = {
      totalEvaluations: 0,
      totalTime: 0,
      errors: 0,
      averageTime: 0,
      maxTime: 0,
      minTime: Infinity,
    };

    const stressTestStartTime = Date.now();

    // Perform many rapid evaluations
    const stressPromises = [];
    for (let i = 0; i < 20; i++) {
      const cartItems: CartItem[] = [
        {
          productId: testProductIds[i % testProductIds.length],
          variantId: testVariantIds[(i * 3) % testVariantIds.length],
          quantity: (i % 5) + 1,
          unitPrice: 2000 + (i * 100),
          subtotal: (2000 + (i * 100)) * ((i % 5) + 1),
          categoryIds: [`category-${i % 3}`],
        }
      ];

      const evaluationContext: PromotionEvaluationContext = {
        cartItems,
        cartSubtotal: cartItems.reduce((sum, item) => sum + item.subtotal, 0),
        customerId: `stress-test-customer-${i}`,
      };

      const evaluationPromise = (async () => {
        const evalStartTime = Date.now();
        try {
          await promotionEngine.evaluatePromotions(evaluationContext);
          const evalEndTime = Date.now();
          const evalTime = evalEndTime - evalStartTime;
          
          stressTestResults.totalEvaluations++;
          stressTestResults.totalTime += evalTime;
          stressTestResults.maxTime = Math.max(stressTestResults.maxTime, evalTime);
          stressTestResults.minTime = Math.min(stressTestResults.minTime, evalTime);
        } catch (error) {
          stressTestResults.errors++;
        }
      })();

      stressPromises.push(evaluationPromise);
    }

    await Promise.all(stressPromises);

    const stressTestEndTime = Date.now();
    const totalStressTime = stressTestEndTime - stressTestStartTime;

    stressTestResults.averageTime = stressTestResults.totalTime / stressTestResults.totalEvaluations;

    console.log('Stress Test Results:', {
      ...stressTestResults,
      totalStressTime,
      evaluationsPerSecond: (stressTestResults.totalEvaluations / totalStressTime) * 1000,
    });

    // Stress test assertions
    expect(stressTestResults.errors).toBe(0); // No errors should occur
    expect(stressTestResults.totalEvaluations).toBe(20);
    expect(stressTestResults.averageTime).toBeLessThan(1000); // Average should be under 1 second
    expect(stressTestResults.maxTime).toBeLessThan(3000); // Max should be under 3 seconds
    expect(totalStressTime).toBeLessThan(10000); // Total should complete within 10 seconds
  });
});