import { z } from 'zod';

// Date range query schema
export const dateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// Types
export type DateRangeParams = z.infer<typeof dateRangeSchema>;

// Revenue metrics response
export interface RevenueMetrics {
  total: number; // Total revenue in cents
  growth: number; // Growth percentage compared to previous period
  byDate: Array<{
    date: string; // ISO date string
    amount: number; // Revenue in cents
  }>;
}

// Order statistics response
export interface OrderStatistics {
  total: number; // Total number of orders
  averageValue: number; // Average order value in cents
  byStatus: Array<{
    status: string;
    count: number;
  }>;
}

// Customer metrics response
export interface CustomerMetrics {
  total: number; // Total number of customers
  new: number; // New customers in period
  returning: number; // Returning customers in period
  growth: number; // Growth percentage
}

// Top product metrics response
export interface TopProductMetric {
  id: string;
  name: string;
  soldCount: number;
  revenue: number;
  imageUrl?: string;
}

// Combined dashboard metrics
export interface DashboardMetrics {
  revenue: RevenueMetrics;
  orders: OrderStatistics;
  customers: CustomerMetrics;
  topProducts?: TopProductMetric[];
}

