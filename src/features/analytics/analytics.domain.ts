import { analyticsRepository } from './analytics.repository';
import type {
  DateRangeParams,
  RevenueMetrics,
  OrderStatistics,
  CustomerMetrics,
  DashboardMetrics,
} from './analytics.interface';

export class AnalyticsDomain {
  /**
   * Get default date range (last 30 days)
   */
  private getDefaultDateRange(): DateRangeParams {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }
  
  /**
   * Format revenue metrics
   */
  private formatRevenueMetrics(data: {
    total: number;
    growth: number;
    byDate: Array<{ date: string; amount: number }>;
  }): RevenueMetrics {
    return {
      total: data.total,
      growth: Math.round(data.growth * 100) / 100, // Round to 2 decimal places
      byDate: data.byDate.map((item) => ({
        date: item.date,
        amount: item.amount,
      })),
    };
  }
  
  /**
   * Format order statistics
   */
  private formatOrderStatistics(data: {
    total: number;
    averageValue: number;
    byStatus: Array<{ status: string; count: number }>;
  }): OrderStatistics {
    return {
      total: data.total,
      averageValue: data.averageValue,
      byStatus: data.byStatus,
    };
  }
  
  /**
   * Format customer metrics
   */
  private formatCustomerMetrics(data: {
    total: number;
    new: number;
    returning: number;
    growth: number;
  }): CustomerMetrics {
    return {
      total: data.total,
      new: data.new,
      returning: data.returning,
      growth: Math.round(data.growth * 100) / 100, // Round to 2 decimal places
    };
  }
  
  /**
   * Get revenue metrics
   */
  async getRevenueMetrics(params?: DateRangeParams): Promise<RevenueMetrics> {
    const dateRange = params || this.getDefaultDateRange();
    const data = await analyticsRepository.getRevenueMetrics(dateRange);
    return this.formatRevenueMetrics(data);
  }
  
  /**
   * Get order statistics
   */
  async getOrderStatistics(params?: DateRangeParams): Promise<OrderStatistics> {
    const dateRange = params || this.getDefaultDateRange();
    const data = await analyticsRepository.getOrderStatistics(dateRange);
    return this.formatOrderStatistics(data);
  }
  
  /**
   * Get customer metrics
   */
  async getCustomerMetrics(params?: DateRangeParams): Promise<CustomerMetrics> {
    const dateRange = params || this.getDefaultDateRange();
    const data = await analyticsRepository.getCustomerMetrics(dateRange);
    return this.formatCustomerMetrics(data);
  }
  
  /**
   * Get combined dashboard metrics
   */
  async getDashboardMetrics(params?: DateRangeParams): Promise<DashboardMetrics> {
    const dateRange = params || this.getDefaultDateRange();
    
    // Fetch all metrics in parallel
    const [revenue, orders, customers] = await Promise.all([
      this.getRevenueMetrics(dateRange),
      this.getOrderStatistics(dateRange),
      this.getCustomerMetrics(dateRange),
    ]);
    
    return {
      revenue,
      orders,
      customers,
    };
  }
}

export const analyticsDomain = new AnalyticsDomain();
