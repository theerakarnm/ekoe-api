import { Hono } from 'hono';
import { requireAdminAuth, requireCustomerAuth } from '../middleware/auth.middleware';
import { validateJson } from '../middleware/validation.middleware';
import { ResponseBuilder } from '../core/response';
import { ordersDomain } from '../features/orders/orders.domain';
import {
  createOrderSchema,
  updateOrderStatusSchema,
} from '../features/orders/orders.interface';
import { auth } from '../libs/auth';
import { getAllShippingMethods } from '../core/config/shipping.config';

const ordersRoutes = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

// Public endpoints
// Get available shipping methods
ordersRoutes.get('/shipping-methods', async (c) => {
  const shippingMethods = getAllShippingMethods();
  return ResponseBuilder.success(c, shippingMethods);
});

// Customer endpoints
// Create order (checkout) - requires authentication
ordersRoutes.post('/', requireCustomerAuth, validateJson(createOrderSchema), async (c) => {
  const data = await c.req.json();
  const user = c.get('user');
  
  // Pass userId for discount code usage tracking
  const order = await ordersDomain.createOrder(data, user?.id);
  
  return ResponseBuilder.created(c, order);
});

// Get order by ID (for order confirmation) - requires authentication
ordersRoutes.get('/:id', requireCustomerAuth, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  
  // Get order and verify it belongs to the user
  const order = await ordersDomain.getOrderById(id);
  
  // Allow access if user is the order owner or if email matches (for guest checkout)
  if (order.userId !== user?.id && order.email !== user?.email) {
    return ResponseBuilder.error(c, 'Unauthorized', 403, 'FORBIDDEN');
  }
  
  return ResponseBuilder.success(c, order);
});

// Get order status history - customer endpoint
ordersRoutes.get('/:id/status-history', requireCustomerAuth, async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  
  // Get order and verify it belongs to the user
  const order = await ordersDomain.getOrderById(id);
  
  // Allow access if user is the order owner or if email matches (for guest checkout)
  if (order.userId !== user?.id && order.email !== user?.email) {
    return ResponseBuilder.error(c, 'Unauthorized', 403, 'FORBIDDEN');
  }
  
  const history = await ordersDomain.getOrderStatusHistory(id);
  return ResponseBuilder.success(c, { history });
});

// Admin endpoints - Order management
ordersRoutes.get('/admin/orders', requireAdminAuth, async (c) => {
  const page = Number(c.req.query('page') || '1');
  const limit = Number(c.req.query('limit') || '20');
  const status = c.req.query('status');
  const search = c.req.query('search');
  const sortBy = c.req.query('sortBy');
  const sortOrder = (c.req.query('sortOrder') || 'desc') as 'asc' | 'desc';

  const result = await ordersDomain.getOrders({
    page,
    limit,
    status,
    search,
    sortBy,
    sortOrder,
  });

  return ResponseBuilder.success(c, result);
});

ordersRoutes.get('/admin/orders/:id', requireAdminAuth, async (c) => {
  const id = c.req.param('id');
  const order = await ordersDomain.getOrderById(id);
  return ResponseBuilder.success(c, order);
});

// Update order status - uses state machine validation
ordersRoutes.post(
  '/admin/orders/:id/status',
  requireAdminAuth,
  validateJson(updateOrderStatusSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = await c.req.json();
    const user = c.get('user');

    const result = await ordersDomain.updateOrderStatus(
      id,
      data,
      user?.id
    );

    return ResponseBuilder.success(c, result);
  }
);

// Get valid next statuses for an order
ordersRoutes.get('/admin/orders/:id/valid-next-statuses', requireAdminAuth, async (c) => {
  const id = c.req.param('id');
  const order = await ordersDomain.getOrderById(id);
  const validNextStatuses = await ordersDomain.getValidNextStatuses(id);
  
  return ResponseBuilder.success(c, {
    currentStatus: order.status,
    validNextStatuses,
  });
});

// Legacy endpoint - kept for backward compatibility
ordersRoutes.patch(
  '/admin/orders/:id',
  requireAdminAuth,
  validateJson(updateOrderStatusSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = await c.req.json();
    const user = c.get('user');

    const order = await ordersDomain.updateOrderStatus(
      id,
      data,
      user?.id
    );

    return ResponseBuilder.success(c, order);
  }
);

ordersRoutes.get('/admin/orders/:id/history', requireAdminAuth, async (c) => {
  const id = c.req.param('id');
  const history = await ordersDomain.getOrderStatusHistory(id);
  return ResponseBuilder.success(c, history);
});

export default ordersRoutes;
