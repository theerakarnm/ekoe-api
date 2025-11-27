import { db } from '../../core/database';
import { orders } from '../../core/database/schema/orders.schema';
import { users } from '../../core/database/schema/auth-schema';
import { sql, gte, lte, and, eq } from 'drizzle-orm';
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
    
    return { total, averageValue, byStatus };
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
    const returningResult = await db
      .select({
        count: sql<number>`COUNT(DISTINCT ${orders.userId})`,
      })
      .from(orders)
      .where(
        and(
          whereClause,
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
}

export const analyticsRepository = new AnalyticsRepository();
