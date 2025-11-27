import { Hono } from 'hono';
import { requireAdminAuth } from '../middleware/auth.middleware';
import { ResponseBuilder } from '../core/response';
import { analyticsDomain } from '../features/analytics/analytics.domain';
import { auth } from '../libs/auth';

const analyticsRoutes = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

// Admin analytics endpoints
analyticsRoutes.get('/admin/analytics/revenue', requireAdminAuth, async (c) => {
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  const metrics = await analyticsDomain.getRevenueMetrics({
    startDate,
    endDate,
  });

  return ResponseBuilder.success(c, metrics);
});

analyticsRoutes.get('/admin/analytics/orders', requireAdminAuth, async (c) => {
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  const statistics = await analyticsDomain.getOrderStatistics({
    startDate,
    endDate,
  });

  return ResponseBuilder.success(c, statistics);
});

analyticsRoutes.get('/admin/analytics/customers', requireAdminAuth, async (c) => {
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  const metrics = await analyticsDomain.getCustomerMetrics({
    startDate,
    endDate,
  });

  return ResponseBuilder.success(c, metrics);
});

analyticsRoutes.get('/admin/dashboard/metrics', requireAdminAuth, async (c) => {
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  const metrics = await analyticsDomain.getDashboardMetrics({
    startDate,
    endDate,
  });

  return ResponseBuilder.success(c, metrics);
});

export default analyticsRoutes;
