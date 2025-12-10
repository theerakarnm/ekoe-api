import { db } from '../../core/database';
import {
  autoPromotions,
  autoPromotionRules,
  autoPromotionUsage,
  autoPromotionAnalytics
} from '../../core/database/schema/promotional-system.schema';
import { products } from '../../core/database/schema/products.schema';
import { eq, and, isNull, lte, gte, inArray, sql, desc, asc, or } from 'drizzle-orm';
import type {
  Promotion,
  PromotionRule,
  PromotionUsage,
  PromotionAnalytics,
  CreatePromotionDto,
  UpdatePromotionDto,
  PromotionListDto,
  PromotionDetailDto,
  PromotionUsageStatsDto
} from './promotions.interface';

export class PromotionRepository {
  /**
   * Create a new promotion
   */
  async createPromotion(data: CreatePromotionDto, createdBy?: string): Promise<Promotion> {
    const [promotion] = await db
      .insert(autoPromotions)
      .values({
        name: data.name,
        description: data.description,
        type: data.type,
        priority: data.priority || 0,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        usageLimit: data.usageLimit,
        usageLimitPerCustomer: data.usageLimitPerCustomer || 1,
        exclusiveWith: data.exclusiveWith ? JSON.stringify(data.exclusiveWith) : null,
        createdBy: createdBy,
        status: 'draft',
      })
      .returning();

    return this.mapPromotionFromDb(promotion);
  }

  /**
   * Update an existing promotion
   */
  async updatePromotion(id: string, data: Partial<UpdatePromotionDto>): Promise<Promotion | null> {
    const updateData: any = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.startsAt !== undefined) updateData.startsAt = new Date(data.startsAt);
    if (data.endsAt !== undefined) updateData.endsAt = new Date(data.endsAt);
    if (data.usageLimit !== undefined) updateData.usageLimit = data.usageLimit;
    if (data.usageLimitPerCustomer !== undefined) updateData.usageLimitPerCustomer = data.usageLimitPerCustomer;
    if (data.exclusiveWith !== undefined) updateData.exclusiveWith = data.exclusiveWith ? JSON.stringify(data.exclusiveWith) : null;

    updateData.updatedAt = new Date();

    const [promotion] = await db
      .update(autoPromotions)
      .set(updateData)
      .where(and(
        eq(autoPromotions.id, id),
        isNull(autoPromotions.deletedAt)
      ))
      .returning();

    return promotion ? this.mapPromotionFromDb(promotion) : null;
  }

  /**
   * Get promotion by ID
   */
  async getPromotionById(id: string): Promise<Promotion | null> {
    const [promotion] = await db
      .select()
      .from(autoPromotions)
      .where(and(
        eq(autoPromotions.id, id),
        isNull(autoPromotions.deletedAt)
      ))
      .limit(1);

    return promotion ? this.mapPromotionFromDb(promotion) : null;
  }

  /**
   * Get promotion with rules by ID
   */
  async getPromotionWithRules(id: string): Promise<PromotionDetailDto | null> {
    const promotion = await this.getPromotionById(id);
    if (!promotion) return null;

    const rules = await this.getPromotionRules(id);

    return {
      ...promotion,
      rules,
    };
  }

  /**
   * Get all active promotions for evaluation
   */
  async getActivePromotions(): Promise<Promotion[]> {
    const now = new Date();

    const promotions = await db
      .select()
      .from(autoPromotions)
      .where(and(
        eq(autoPromotions.status, 'active'),
        lte(autoPromotions.startsAt, now),
        gte(autoPromotions.endsAt, now),
        isNull(autoPromotions.deletedAt)
      ))
      .orderBy(desc(autoPromotions.priority), asc(autoPromotions.createdAt));

    return promotions.map(p => this.mapPromotionFromDb(p));
  }

  /**
   * Get promotions with pagination and filtering
   */
  async getPromotions(options: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Promise<{ promotions: PromotionListDto[]; total: number }> {
    const { page = 1, limit = 20, status, type, search, sortBy = 'createdAt', sortOrder = 'desc' } = options;
    const offset = (page - 1) * limit;

    let whereConditions = [isNull(autoPromotions.deletedAt)];

    if (status) {
      whereConditions.push(eq(autoPromotions.status, status as any));
    }

    if (type) {
      whereConditions.push(eq(autoPromotions.type, type as any));
    }

    if (search) {
      whereConditions.push(
        sql`${autoPromotions.name} ILIKE ${'%' + search + '%'} OR (${autoPromotions.description} IS NOT NULL AND ${autoPromotions.description} ILIKE ${'%' + search + '%'})`
      );
    }

    // Determine sort column and order
    const sortColumn = this.getSortColumn(sortBy);
    const orderFn = sortOrder === 'asc' ? asc : desc;

    const [promotions, totalResult] = await Promise.all([
      db
        .select({
          id: autoPromotions.id,
          name: autoPromotions.name,
          type: autoPromotions.type,
          status: autoPromotions.status,
          startsAt: autoPromotions.startsAt,
          endsAt: autoPromotions.endsAt,
          currentUsageCount: autoPromotions.currentUsageCount,
          usageLimit: autoPromotions.usageLimit,
          priority: autoPromotions.priority,
        })
        .from(autoPromotions)
        .where(and(...whereConditions))
        .orderBy(orderFn(sortColumn))
        .limit(limit)
        .offset(offset),

      db
        .select({ count: sql<number>`count(*)` })
        .from(autoPromotions)
        .where(and(...whereConditions))
    ]);

    return {
      promotions: promotions.map(p => ({
        ...p,
        type: p.type as any,
        status: p.status as any,
        startsAt: new Date(p.startsAt),
        endsAt: new Date(p.endsAt),
        currentUsageCount: p.currentUsageCount || 0,
        usageLimit: p.usageLimit || undefined,
        priority: p.priority || 0,
      })),
      total: Number(totalResult[0]?.count || 0),
    };
  }

  /**
   * Get promotion rules by promotion ID
   */
  async getPromotionRules(promotionId: string): Promise<PromotionRule[]> {
    const rules = await db
      .select()
      .from(autoPromotionRules)
      .where(eq(autoPromotionRules.promotionId, promotionId))
      .orderBy(asc(autoPromotionRules.createdAt));

    return rules.map(rule => this.mapPromotionRuleFromDb(rule));
  }

  /**
   * Create promotion rule
   */
  async createPromotionRule(rule: Omit<PromotionRule, 'id' | 'createdAt'>): Promise<PromotionRule> {
    const [createdRule] = await db
      .insert(autoPromotionRules)
      .values({
        promotionId: rule.promotionId,
        ruleType: rule.ruleType,
        conditionType: rule.conditionType,
        operator: rule.operator,
        numericValue: rule.numericValue?.toString(),
        textValue: rule.textValue,
        jsonValue: rule.jsonValue ? JSON.stringify(rule.jsonValue) : null,
        benefitType: rule.benefitType,
        benefitValue: rule.benefitValue?.toString(),
        maxDiscountAmount: rule.maxDiscountAmount,
        applicableProductIds: rule.applicableProductIds ? JSON.stringify(rule.applicableProductIds) : null,
        applicableCategoryIds: rule.applicableCategoryIds ? JSON.stringify(rule.applicableCategoryIds) : null,
        giftProductIds: rule.giftProductIds ? JSON.stringify(rule.giftProductIds) : null,
        giftQuantities: rule.giftQuantities ? JSON.stringify(rule.giftQuantities) : null,
      })
      .returning();

    return this.mapPromotionRuleFromDb(createdRule);
  }

  /**
   * Delete promotion rule
   */
  async deletePromotionRule(ruleId: string): Promise<boolean> {
    const result = await db
      .delete(autoPromotionRules)
      .where(eq(autoPromotionRules.id, ruleId));

    return (result.rowCount || 0) > 0;
  }

  /**
   * Check for promotion conflicts based on exclusivity rules
   */
  async checkPromotionConflicts(promotionId: string, otherPromotionIds: string[]): Promise<string[]> {
    if (otherPromotionIds.length === 0) return [];

    const promotion = await this.getPromotionById(promotionId);
    if (!promotion || !promotion.exclusiveWith) return [];

    const exclusiveWith = Array.isArray(promotion.exclusiveWith)
      ? promotion.exclusiveWith
      : JSON.parse(promotion.exclusiveWith as string);

    return otherPromotionIds.filter(id => exclusiveWith.includes(id));
  }

  /**
   * Get promotions ordered by priority for conflict resolution
   */
  async getPromotionsByPriority(promotionIds: string[]): Promise<Promotion[]> {
    if (promotionIds.length === 0) return [];

    const promotions = await db
      .select()
      .from(autoPromotions)
      .where(and(
        inArray(autoPromotions.id, promotionIds),
        isNull(autoPromotions.deletedAt)
      ))
      .orderBy(desc(autoPromotions.priority), asc(autoPromotions.createdAt));

    return promotions.map(p => this.mapPromotionFromDb(p));
  }

  /**
   * Record promotion usage
   */
  async recordPromotionUsage(usage: Omit<PromotionUsage, 'id' | 'createdAt'>): Promise<PromotionUsage> {
    const [createdUsage] = await db
      .insert(autoPromotionUsage)
      .values({
        promotionId: usage.promotionId,
        orderId: usage.orderId,
        customerId: usage.customerId,
        discountAmount: usage.discountAmount,
        freeGifts: usage.freeGifts ? JSON.stringify(usage.freeGifts) : null,
        cartSubtotal: usage.cartSubtotal,
        promotionSnapshot: usage.promotionSnapshot ? JSON.stringify(usage.promotionSnapshot) : null,
      })
      .returning();

    return this.mapPromotionUsageFromDb(createdUsage);
  }

  /**
   * Increment promotion usage count
   */
  async incrementPromotionUsage(promotionId: string): Promise<void> {
    await db
      .update(autoPromotions)
      .set({
        currentUsageCount: sql`${autoPromotions.currentUsageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(autoPromotions.id, promotionId));
  }

  /**
   * Get promotion usage count for customer
   */
  async getCustomerPromotionUsageCount(promotionId: string, customerId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(autoPromotionUsage)
      .where(and(
        eq(autoPromotionUsage.promotionId, promotionId),
        eq(autoPromotionUsage.customerId, customerId)
      ));

    return Number(result[0]?.count || 0);
  }

  /**
   * Get promotion usage statistics
   */
  async getPromotionUsageStats(promotionId: string): Promise<PromotionUsageStatsDto> {
    const [totalUsageResult, revenueResult, topCustomersResult] = await Promise.all([
      // Total usage and discount
      db
        .select({
          totalUsage: sql<number>`count(*)`,
          totalDiscount: sql<number>`sum(${autoPromotionUsage.discountAmount})`,
        })
        .from(autoPromotionUsage)
        .where(eq(autoPromotionUsage.promotionId, promotionId)),

      // Total revenue from orders with this promotion
      db
        .select({
          totalRevenue: sql<number>`sum(${autoPromotionUsage.cartSubtotal})`,
          averageOrderValue: sql<number>`avg(${autoPromotionUsage.cartSubtotal})`,
        })
        .from(autoPromotionUsage)
        .where(eq(autoPromotionUsage.promotionId, promotionId)),

      // Top customers
      db
        .select({
          customerId: autoPromotionUsage.customerId,
          usageCount: sql<number>`count(*)`,
          totalDiscount: sql<number>`sum(${autoPromotionUsage.discountAmount})`,
        })
        .from(autoPromotionUsage)
        .where(and(
          eq(autoPromotionUsage.promotionId, promotionId),
          sql`${autoPromotionUsage.customerId} IS NOT NULL`
        ))
        .groupBy(autoPromotionUsage.customerId)
        .orderBy(desc(sql`count(*)`))
        .limit(10)
    ]);

    const totalUsage = Number(totalUsageResult[0]?.totalUsage || 0);
    const totalDiscount = Number(totalUsageResult[0]?.totalDiscount || 0);
    const totalRevenue = Number(revenueResult[0]?.totalRevenue || 0);
    const averageOrderValue = Number(revenueResult[0]?.averageOrderValue || 0);

    return {
      totalUsage,
      totalDiscount,
      totalRevenue,
      conversionRate: 0, // This would need view tracking to calculate properly
      averageOrderValue,
      topCustomers: topCustomersResult.map(customer => ({
        customerId: customer.customerId!,
        usageCount: Number(customer.usageCount),
        totalDiscount: Number(customer.totalDiscount),
      })),
    };
  }

  /**
   * Update promotion status
   */
  async updatePromotionStatus(id: string, status: string): Promise<boolean> {
    const result = await db
      .update(autoPromotions)
      .set({
        status: status as any,
        updatedAt: new Date(),
      })
      .where(and(
        eq(autoPromotions.id, id),
        isNull(autoPromotions.deletedAt)
      ));

    return (result.rowCount || 0) > 0;
  }

  /**
   * Soft delete promotion
   */
  async deletePromotion(id: string): Promise<boolean> {
    const result = await db
      .update(autoPromotions)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(autoPromotions.id, id),
        isNull(autoPromotions.deletedAt)
      ));

    return (result.rowCount || 0) > 0;
  }

  /**
   * Validate gift products exist and are in stock
   */
  async validateGiftProducts(productIds: string[]): Promise<{ id: string; name: string; inStock: boolean }[]> {
    if (productIds.length === 0) return [];

    const productResults = await db
      .select({
        id: products.id,
        name: products.name,
        status: products.status,
      })
      .from(products)
      .where(and(
        inArray(products.id, productIds),
        isNull(products.deletedAt)
      ));

    return productResults.map((product: any) => ({
      id: product.id,
      name: product.name,
      inStock: product.status === 'active', // Simplified stock check
    }));
  }

  /**
   * Validate gift products with detailed stock information
   */
  async validateGiftProductsWithStock(productIds: string[]): Promise<Array<{
    id: string;
    name: string;
    status: string;
    availableQuantity: number;
    imageUrl?: string;
  }>> {
    if (productIds.length === 0) return [];

    const productResults = await db
      .select({
        id: products.id,
        name: products.name,
        status: products.status,
      })
      .from(products)
      .where(and(
        inArray(products.id, productIds),
        isNull(products.deletedAt)
      ));

    // Note: stockQuantity is tracked per variant, not per product
    // For gift products, we assume availability based on status
    return productResults.map((product: any) => ({
      id: product.id,
      name: product.name,
      status: product.status,
      availableQuantity: product.status === 'active' ? 1 : 0,
      imageUrl: undefined,
    }));
  }

  /**
   * Record promotion analytics
   */
  async recordPromotionAnalytics(promotionId: string, analytics: {
    applications?: number;
    totalDiscountAmount?: number;
    totalOrders?: number;
    totalRevenue?: number;
    views?: number;
  }): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    await db
      .insert(autoPromotionAnalytics)
      .values({
        promotionId,
        date: today,
        hour: null, // Daily analytics
        views: analytics.views || 0,
        applications: analytics.applications || 0,
        totalDiscountAmount: analytics.totalDiscountAmount || 0,
        totalOrders: analytics.totalOrders || 0,
        totalRevenue: analytics.totalRevenue || 0,
      })
      .onConflictDoUpdate({
        target: [autoPromotionAnalytics.promotionId, autoPromotionAnalytics.date],
        set: {
          views: sql`${autoPromotionAnalytics.views} + ${analytics.views || 0}`,
          applications: sql`${autoPromotionAnalytics.applications} + ${analytics.applications || 0}`,
          totalDiscountAmount: sql`${autoPromotionAnalytics.totalDiscountAmount} + ${analytics.totalDiscountAmount || 0}`,
          totalOrders: sql`${autoPromotionAnalytics.totalOrders} + ${analytics.totalOrders || 0}`,
          totalRevenue: sql`${autoPromotionAnalytics.totalRevenue} + ${analytics.totalRevenue || 0}`,
        },
      });
  }

  /**
   * Batch record promotion analytics for multiple promotions
   */
  async batchRecordPromotionAnalytics(analyticsData: Array<{
    promotionId: string;
    applications?: number;
    totalDiscountAmount?: number;
    totalOrders?: number;
    totalRevenue?: number;
    views?: number;
  }>): Promise<void> {
    if (analyticsData.length === 0) return;

    const today = new Date().toISOString().split('T')[0];

    // Process each promotion's analytics
    for (const analytics of analyticsData) {
      await this.recordPromotionAnalytics(analytics.promotionId, {
        applications: analytics.applications,
        totalDiscountAmount: analytics.totalDiscountAmount,
        totalOrders: analytics.totalOrders,
        totalRevenue: analytics.totalRevenue,
        views: analytics.views,
      });
    }
  }

  /**
   * Get promotion analytics for a date range
   */
  async getPromotionAnalytics(
    promotionId: string,
    startDate?: string,
    endDate?: string
  ): Promise<PromotionAnalytics[]> {
    let whereConditions = [eq(autoPromotionAnalytics.promotionId, promotionId)];

    if (startDate) {
      whereConditions.push(gte(autoPromotionAnalytics.date, startDate));
    }

    if (endDate) {
      whereConditions.push(lte(autoPromotionAnalytics.date, endDate));
    }

    const analytics = await db
      .select()
      .from(autoPromotionAnalytics)
      .where(and(...whereConditions))
      .orderBy(desc(autoPromotionAnalytics.date));

    return analytics.map(a => ({
      id: a.id,
      promotionId: a.promotionId,
      date: a.date,
      hour: a.hour ?? undefined,
      views: a.views || 0,
      applications: a.applications || 0,
      totalDiscountAmount: a.totalDiscountAmount || 0,
      totalOrders: a.totalOrders || 0,
      totalRevenue: a.totalRevenue || 0,
      conversionRate: a.conversionRate ? parseFloat(a.conversionRate) : undefined,
      averageOrderValue: a.averageOrderValue ?? undefined,
      createdAt: new Date(a.createdAt),
    }));
  }

  /**
   * Get promotion ROI metrics
   */
  async getPromotionROI(promotionId: string, startDate?: string, endDate?: string): Promise<{
    totalRevenue: number;
    totalDiscount: number;
    roi: number;
    orderCount: number;
    averageOrderValue: number;
  }> {
    let whereConditions = [eq(autoPromotionUsage.promotionId, promotionId)];

    if (startDate) {
      whereConditions.push(gte(autoPromotionUsage.createdAt, new Date(startDate)));
    }

    if (endDate) {
      whereConditions.push(lte(autoPromotionUsage.createdAt, new Date(endDate)));
    }

    const result = await db
      .select({
        totalRevenue: sql<number>`sum(${autoPromotionUsage.cartSubtotal})`,
        totalDiscount: sql<number>`sum(${autoPromotionUsage.discountAmount})`,
        orderCount: sql<number>`count(*)`,
        averageOrderValue: sql<number>`avg(${autoPromotionUsage.cartSubtotal})`,
      })
      .from(autoPromotionUsage)
      .where(and(...whereConditions));

    const metrics = result[0];
    const totalRevenue = Number(metrics?.totalRevenue || 0);
    const totalDiscount = Number(metrics?.totalDiscount || 0);
    const orderCount = Number(metrics?.orderCount || 0);
    const averageOrderValue = Number(metrics?.averageOrderValue || 0);

    const roi = totalDiscount > 0 ? ((totalRevenue - totalDiscount) / totalDiscount) * 100 : 0;

    return {
      totalRevenue,
      totalDiscount,
      roi: Math.round(roi * 100) / 100,
      orderCount,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
    };
  }

  /**
   * Get promotion performance trends
   */
  async getPromotionTrends(promotionId: string, days: number = 30): Promise<Array<{
    date: string;
    applications: number;
    revenue: number;
    discountAmount: number;
    orders: number;
  }>> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days * 24 * 60 * 60 * 1000));

    const trends = await db
      .select({
        date: sql<string>`DATE(${autoPromotionUsage.createdAt})`,
        applications: sql<number>`count(*)`,
        revenue: sql<number>`sum(${autoPromotionUsage.cartSubtotal})`,
        discountAmount: sql<number>`sum(${autoPromotionUsage.discountAmount})`,
        orders: sql<number>`count(DISTINCT ${autoPromotionUsage.orderId})`,
      })
      .from(autoPromotionUsage)
      .where(and(
        eq(autoPromotionUsage.promotionId, promotionId),
        gte(autoPromotionUsage.createdAt, startDate),
        lte(autoPromotionUsage.createdAt, endDate)
      ))
      .groupBy(sql`DATE(${autoPromotionUsage.createdAt})`)
      .orderBy(sql`DATE(${autoPromotionUsage.createdAt})`);

    return trends.map(trend => ({
      date: trend.date,
      applications: Number(trend.applications),
      revenue: Number(trend.revenue),
      discountAmount: Number(trend.discountAmount),
      orders: Number(trend.orders),
    }));
  }

  /**
   * Get top customers by promotion usage
   */
  async getTopCustomersByPromotion(promotionId: string, limit: number = 10): Promise<Array<{
    customerId: string;
    usageCount: number;
    totalSpent: number;
    totalSavings: number;
    averageOrderValue: number;
  }>> {
    const customers = await db
      .select({
        customerId: autoPromotionUsage.customerId,
        usageCount: sql<number>`count(*)`,
        totalSpent: sql<number>`sum(${autoPromotionUsage.cartSubtotal})`,
        totalSavings: sql<number>`sum(${autoPromotionUsage.discountAmount})`,
        averageOrderValue: sql<number>`avg(${autoPromotionUsage.cartSubtotal})`,
      })
      .from(autoPromotionUsage)
      .where(and(
        eq(autoPromotionUsage.promotionId, promotionId),
        sql`${autoPromotionUsage.customerId} IS NOT NULL`
      ))
      .groupBy(autoPromotionUsage.customerId)
      .orderBy(desc(sql`sum(${autoPromotionUsage.cartSubtotal})`))
      .limit(limit);

    return customers.map(customer => ({
      customerId: customer.customerId!,
      usageCount: Number(customer.usageCount),
      totalSpent: Number(customer.totalSpent),
      totalSavings: Number(customer.totalSavings),
      averageOrderValue: Number(customer.averageOrderValue),
    }));
  }

  /**
   * Get promotions that need status updates (scheduled -> active, active -> expired)
   */
  async getPromotionsForStatusUpdate(): Promise<Promotion[]> {
    const now = new Date();

    const promotions = await db
      .select()
      .from(autoPromotions)
      .where(and(
        or(
          // Scheduled promotions that should be active
          and(
            eq(autoPromotions.status, 'scheduled'),
            lte(autoPromotions.startsAt, now)
          ),
          // Active promotions that should be expired
          and(
            eq(autoPromotions.status, 'active'),
            lte(autoPromotions.endsAt, now)
          )
        ),
        isNull(autoPromotions.deletedAt)
      ));

    return promotions.map(p => this.mapPromotionFromDb(p));
  }

  /**
   * Helper method to get sort column
   */
  private getSortColumn(sortBy: string) {
    switch (sortBy) {
      case 'name':
        return autoPromotions.name;
      case 'type':
        return autoPromotions.type;
      case 'status':
        return autoPromotions.status;
      case 'startsAt':
        return autoPromotions.startsAt;
      case 'endsAt':
        return autoPromotions.endsAt;
      case 'priority':
        return autoPromotions.priority;
      case 'currentUsageCount':
        return autoPromotions.currentUsageCount;
      case 'updatedAt':
        return autoPromotions.updatedAt;
      case 'createdAt':
      default:
        return autoPromotions.createdAt;
    }
  }

  /**
   * Helper method to map database promotion to interface
   */
  private mapPromotionFromDb(dbPromotion: any): Promotion {
    return {
      id: dbPromotion.id,
      name: dbPromotion.name,
      description: dbPromotion.description,
      type: dbPromotion.type,
      status: dbPromotion.status,
      priority: dbPromotion.priority,
      startsAt: new Date(dbPromotion.startsAt),
      endsAt: new Date(dbPromotion.endsAt),
      usageLimit: dbPromotion.usageLimit,
      usageLimitPerCustomer: dbPromotion.usageLimitPerCustomer,
      currentUsageCount: dbPromotion.currentUsageCount,
      exclusiveWith: dbPromotion.exclusiveWith ? JSON.parse(dbPromotion.exclusiveWith) : undefined,
      createdBy: dbPromotion.createdBy,
      createdAt: new Date(dbPromotion.createdAt),
      updatedAt: new Date(dbPromotion.updatedAt),
      deletedAt: dbPromotion.deletedAt ? new Date(dbPromotion.deletedAt) : undefined,
    };
  }

  /**
   * Helper method to safely parse JSON with fallback
   */
  private safeJsonParse(jsonString: string | null): any {
    if (!jsonString) return undefined;
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.warn('Failed to parse JSON:', jsonString, error);
      return undefined;
    }
  }

  /**
   * Helper method to map database promotion rule to interface
   */
  private mapPromotionRuleFromDb(dbRule: any): PromotionRule {
    return {
      id: dbRule.id,
      promotionId: dbRule.promotionId,
      ruleType: dbRule.ruleType,
      conditionType: dbRule.conditionType,
      operator: dbRule.operator,
      numericValue: dbRule.numericValue ? parseFloat(dbRule.numericValue) : undefined,
      textValue: dbRule.textValue,
      jsonValue: this.safeJsonParse(dbRule.jsonValue),
      benefitType: dbRule.benefitType,
      benefitValue: dbRule.benefitValue ? parseFloat(dbRule.benefitValue) : undefined,
      maxDiscountAmount: dbRule.maxDiscountAmount,
      applicableProductIds: this.safeJsonParse(dbRule.applicableProductIds),
      applicableCategoryIds: this.safeJsonParse(dbRule.applicableCategoryIds),
      giftProductIds: this.safeJsonParse(dbRule.giftProductIds),
      giftQuantities: this.safeJsonParse(dbRule.giftQuantities),
      createdAt: new Date(dbRule.createdAt),
    };
  }

  /**
   * Helper method to map database promotion usage to interface
   */
  private mapPromotionUsageFromDb(dbUsage: any): PromotionUsage {
    return {
      id: dbUsage.id,
      promotionId: dbUsage.promotionId,
      orderId: dbUsage.orderId,
      customerId: dbUsage.customerId,
      discountAmount: dbUsage.discountAmount,
      freeGifts: dbUsage.freeGifts ? JSON.parse(dbUsage.freeGifts) : undefined,
      cartSubtotal: dbUsage.cartSubtotal,
      promotionSnapshot: dbUsage.promotionSnapshot ? JSON.parse(dbUsage.promotionSnapshot) : undefined,
      createdAt: new Date(dbUsage.createdAt),
    };
  }
}

export const promotionRepository = new PromotionRepository();