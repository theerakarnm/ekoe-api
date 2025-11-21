export interface OrderStatusMetric {
  status: string;
  count: number;
}

export interface RevenueByDateMetric {
  date: string;
  revenue: number;
}

export interface DashboardMetrics {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  totalProducts: number;
  ordersByStatus: OrderStatusMetric[];
  revenueByDate: RevenueByDateMetric[];
}
