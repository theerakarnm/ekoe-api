import { db } from '../../core/database';
import { orders } from '../../core/database/schema/orders.schema';
import { customerProfiles } from '../../core/database/schema/customers.schema';
import { products } from '../../core/database/schema/products.schema';
import { sql, count, sum, eq, and, isNull, gte } from 'drizzle-orm';
import type { DashboardMetrics } from './dashboard.interface';

export class DashboardRepository {
  async getMetrics(): Promise<DashboardMetrics> {
    // Get total revenue and order count
    const revenueResult = await db
      .select({
        totalRevenue: sum(orders.totalAmount),
        totalOrders: count(orders.id),
      })
      .from(orders)
      .where(eq(orders.paymentStatus, 'paid'));

    // Get total customers
    const customerResult = await db
      .select({
        totalCustomers: count(customerProfiles.id),
      })
      .from(customerProfiles);

    // Get total products (active only)
    const productResult = await db
      .select({
        totalProducts: count(products.id),
      })
      .from(products)
      .where(
        and(
          eq(products.status, 'active'),
          isNull(products.deletedAt)
        )
      );

    // Get orders by status
    const ordersByStatus = await db
      .select({
        status: orders.status,
        count: count(orders.id),
      })
      .from(orders)
      .groupBy(orders.status);

    // Get revenue by date (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const revenueByDate = await db
      .select({
        date: sql<string>`DATE(${orders.createdAt})`,
        revenue: sum(orders.totalAmount),
      })
      .from(orders)
      .where(
        and(
          eq(orders.paymentStatus, 'paid'),
          gte(orders.createdAt, thirtyDaysAgo)
        )
      )
      .groupBy(sql`DATE(${orders.createdAt})`)
      .orderBy(sql`DATE(${orders.createdAt})`);

    return {
      totalRevenue: Number(revenueResult[0]?.totalRevenue || 0),
      totalOrders: Number(revenueResult[0]?.totalOrders || 0),
      totalCustomers: Number(customerResult[0]?.totalCustomers || 0),
      totalProducts: Number(productResult[0]?.totalProducts || 0),
      ordersByStatus: ordersByStatus.map(item => ({
        status: item.status,
        count: Number(item.count),
      })),
      revenueByDate: revenueByDate.map(item => ({
        date: item.date,
        revenue: Number(item.revenue || 0),
      })),
    };
  }
}

export const dashboardRepository = new DashboardRepository();
