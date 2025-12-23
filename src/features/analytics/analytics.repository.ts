import { db } from '../../core/database';
import { orders, orderItems } from '../../core/database/schema/orders.schema';
import { productImages } from '../../core/database/schema/products.schema';
import { users } from '../../core/database/schema/auth-schema';
import { contacts } from '../../core/database/schema/contact.schema';
import { sql, gte, lte, and, eq, count } from 'drizzle-orm';
import type { DateRangeParams } from './analytics.interface';

export class AnalyticsRepository {
  /**
   * Get revenue metrics with date range filtering
   */
  async getRevenueMetrics(params: DateRangeParams) {
    const { startDate, endDate } = params;

    // Build date conditions
    const conditions = [];
    if (startDate) {
      conditions.push(gte(orders.createdAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(orders.createdAt, new Date(endDate)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total revenue for the period
    const totalResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      })
      .from(orders)
      .where(
        and(
          whereClause,
          eq(orders.paymentStatus, 'paid')
        )
      );

    const total = Number(totalResult[0]?.total || 0);

    // Get revenue by date
    const byDateResult = await db
      .select({
        date: sql<string>`DATE(${orders.createdAt})`,
        amount: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
      })
      .from(orders)
      .where(
        and(
          whereClause,
          eq(orders.paymentStatus, 'paid')
        )
      )
      .groupBy(sql`DATE(${orders.createdAt})`)
      .orderBy(sql`DATE(${orders.createdAt})`);

    const byDate = byDateResult.map((row) => ({
      date: row.date,
      amount: Number(row.amount),
    }));

    // Calculate growth (compare with previous period)
    let growth = 0;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      const previousStart = new Date(start);
      previousStart.setDate(previousStart.getDate() - periodDays);

      const previousResult = await db
        .select({
          total: sql<number>`COALESCE(SUM(${orders.totalAmount}), 0)`,
        })
        .from(orders)
        .where(
          and(
            gte(orders.createdAt, previousStart),
            lte(orders.createdAt, start),
            eq(orders.paymentStatus, 'paid')
          )
        );

      const previousTotal = Number(previousResult[0]?.total || 0);

      if (previousTotal > 0) {
        growth = ((total - previousTotal) / previousTotal) * 100;
      } else if (total > 0) {
        growth = 100;
      }
    }

    return { total, growth, byDate };
  }

  /**
   * Get order statistics with status breakdown
   */
  async getOrderStatistics(params: DateRangeParams) {
    const { startDate, endDate } = params;

    // Build date conditions
    const conditions = [];
    if (startDate) {
      conditions.push(gte(orders.createdAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(orders.createdAt, new Date(endDate)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total orders and average value
    const totalResult = await db
      .select({
        total: sql<number>`COUNT(*)`,
        averageValue: sql<number>`COALESCE(AVG(${orders.totalAmount}), 0)`,
      })
      .from(orders)
      .where(whereClause);

    const total = Number(totalResult[0]?.total || 0);
    const averageValue = Math.round(Number(totalResult[0]?.averageValue || 0));

    // Get orders by status
    const byStatusResult = await db
      .select({
        status: orders.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(orders)
      .where(whereClause)
      .groupBy(orders.status)
      .orderBy(orders.status);

    const byStatus = byStatusResult.map((row) => ({
      status: row.status,
      count: Number(row.count),
    }));

    // Calculate growth (compare with previous period)
    let growth = 0;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      const previousStart = new Date(start);
      previousStart.setDate(previousStart.getDate() - periodDays);

      const previousResult = await db
        .select({
          total: sql<number>`COUNT(*)`,
        })
        .from(orders)
        .where(
          and(
            gte(orders.createdAt, previousStart),
            lte(orders.createdAt, start)
          )
        );

      const previousTotal = Number(previousResult[0]?.total || 0);

      if (previousTotal > 0) {
        growth = ((total - previousTotal) / previousTotal) * 100;
      } else if (total > 0) {
        growth = 100;
      }
    }

    return { total, averageValue, growth, byStatus };
  }

  /**
   * Get customer metrics with growth data
   */
  async getCustomerMetrics(params: DateRangeParams) {
    const { startDate, endDate } = params;

    // Build date conditions
    const conditions = [];
    if (startDate) {
      conditions.push(gte(users.createdAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(users.createdAt, new Date(endDate)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total customers
    const totalResult = await db
      .select({
        total: sql<number>`COUNT(*)`,
      })
      .from(users)
      .where(eq(users.role, 'customer'));

    const total = Number(totalResult[0]?.total || 0);

    // Get new customers in period
    const newResult = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(users)
      .where(
        and(
          whereClause,
          eq(users.role, 'customer')
        )
      );

    const newCustomers = Number(newResult[0]?.count || 0);

    // Get returning customers (customers who made more than one order in period)
    // Build date conditions for orders table
    const orderConditions = [];
    if (startDate) {
      orderConditions.push(gte(orders.createdAt, new Date(startDate)));
    }
    if (endDate) {
      orderConditions.push(lte(orders.createdAt, new Date(endDate)));
    }
    const orderWhereClause = orderConditions.length > 0 ? and(...orderConditions) : undefined;

    const returningResult = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${orders.userId})`,
      })
      .from(orders)
      .where(
        and(
          orderWhereClause,
          sql`${orders.userId} IS NOT NULL`,
          sql`${orders.userId} IN (
            SELECT ${orders.userId}
            FROM ${orders}
            WHERE ${orders.userId} IS NOT NULL
            GROUP BY ${orders.userId}
            HAVING COUNT(*) > 1
          )`
        )
      );

    const returning = Number(returningResult[0]?.count || 0);

    // Calculate growth
    let growth = 0;
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      const previousStart = new Date(start);
      previousStart.setDate(previousStart.getDate() - periodDays);

      const previousResult = await db
        .select({
          count: sql<number>`COUNT(*)`,
        })
        .from(users)
        .where(
          and(
            gte(users.createdAt, previousStart),
            lte(users.createdAt, start),
            eq(users.role, 'customer')
          )
        );

      const previousCount = Number(previousResult[0]?.count || 0);

      if (previousCount > 0) {
        growth = ((newCustomers - previousCount) / previousCount) * 100;
      } else if (newCustomers > 0) {
        growth = 100;
      }
    }

    return { total, new: newCustomers, returning, growth };
  }

  /**
   * Get top products by revenue
   */
  async getTopProducts(params: DateRangeParams, limit: number = 5) {
    const { startDate, endDate } = params;

    // Build date conditions for orders
    const conditions = [];
    if (startDate) {
      conditions.push(gte(orders.createdAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(orders.createdAt, new Date(endDate)));
    }
    conditions.push(eq(orders.paymentStatus, 'paid'));

    const whereClause = and(...conditions);

    // Get top products by joining order_items with orders and products
    const topProducts = await db
      .select({
        id: orderItems.productId,
        name: orderItems.productName,
        soldCount: sql<number>`SUM(${orderItems.quantity})`,
        revenue: sql<number>`SUM(${orderItems.subtotal})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          whereClause,
          sql`${orderItems.productId} IS NOT NULL`
        )
      )
      .groupBy(orderItems.productId, orderItems.productName)
      .orderBy(sql`SUM(${orderItems.subtotal}) DESC`)
      .limit(limit);

    // Get product images for the top products
    const productIds = topProducts.map(p => p.id).filter(Boolean) as string[];

    let imageMap: Record<string, string> = {};
    if (productIds.length > 0) {
      const images = await db
        .select({
          productId: productImages.productId,
          url: productImages.url,
        })
        .from(productImages)
        .where(
          and(
            sql`${productImages.productId} IN ${productIds}`,
            eq(productImages.isPrimary, true)
          )
        );

      imageMap = images.reduce((acc, img) => {
        acc[img.productId] = img.url;
        return acc;
      }, {} as Record<string, string>);
    }

    return topProducts.map(product => ({
      id: product.id || '',
      name: product.name,
      soldCount: Number(product.soldCount),
      revenue: Number(product.revenue),
      imageUrl: product.id ? imageMap[product.id] : undefined,
    }));
  }

  // Get contact metrics
  async getContactMetrics(params: DateRangeParams) {
    // Current period unread count
    const [currentUnread] = await db
      .select({ count: count() })
      .from(contacts)
      .where(eq(contacts.status, 'unread'));

    // We can also calculate growth if we want, but for unread messages, 
    // simply showing the current count is most important.

    return {
      unread: Number(currentUnread?.count || 0),
      growth: 0, // Placeholder
    };
  }
}

export const analyticsRepository = new AnalyticsRepository();

