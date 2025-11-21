import { Hono } from 'hono';
import { db } from '../core/database';
import { orders } from '../core/database/schema/orders.schema';
import { customerProfiles } from '../core/database/schema/customers.schema';
import { products } from '../core/database/schema/products.schema';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateJson } from '../middleware/validation.middleware';
import { ResponseBuilder } from '../core/response';
import { sql, count, sum, eq, and, isNull, gte } from 'drizzle-orm';
import { productsDomain } from '../features/products/products.domain';
import { productsRepository } from '../features/products/products.repository';
import { createProductSchema, updateProductSchema } from '../features/products/products.interface';
import { blogDomain } from '../features/blog/blog.domain';
import { createBlogPostSchema, updateBlogPostSchema } from '../features/blog/blog.interface';
import { couponsDomain } from '../features/coupons/coupons.domain';
import { createCouponSchema, updateCouponSchema } from '../features/coupons/coupons.interface';

const adminRoutes = new Hono();

// Dashboard metrics endpoint
adminRoutes.get('/dashboard/metrics', authMiddleware, async (c) => {
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

  const metrics = {
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

  return ResponseBuilder.success(c, metrics);
});

// Product CRUD endpoints
adminRoutes.get('/products', authMiddleware, async (c) => {
  const page = Number(c.req.query('page') || '1');
  const limit = Number(c.req.query('limit') || '20');
  const search = c.req.query('search');
  const status = c.req.query('status');
  const sortBy = c.req.query('sortBy');
  const sortOrder = (c.req.query('sortOrder') || 'desc') as 'asc' | 'desc';

  const result = await productsDomain.getAllProducts({
    page,
    limit,
    search,
    status,
    sortBy,
    sortOrder,
  });

  return ResponseBuilder.success(c, result);
});

adminRoutes.get('/products/:id', authMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  const product = await productsDomain.getProductById(id);
  return ResponseBuilder.success(c, product);
});

adminRoutes.post('/products', authMiddleware, validateJson(createProductSchema), async (c) => {
  const data = await c.req.json();
  const product = await productsDomain.createProduct(data);
  return ResponseBuilder.created(c, product);
});

adminRoutes.put('/products/:id', authMiddleware, validateJson(updateProductSchema), async (c) => {
  const id = Number(c.req.param('id'));
  const data = await c.req.json();
  const product = await productsDomain.updateProduct(id, data);
  return ResponseBuilder.success(c, product);
});

adminRoutes.delete('/products/:id', authMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  await productsDomain.deleteProduct(id);
  return ResponseBuilder.noContent(c);
});

// Product image upload endpoint
adminRoutes.post('/products/:id/images', authMiddleware, async (c) => {
  const productId = Number(c.req.param('id'));
  
  // Verify product exists
  await productsDomain.getProductById(productId);
  
  const body = await c.req.json();
  const { url, altText, description, sortOrder = 0, isPrimary = false } = body;
  
  if (!url) {
    return ResponseBuilder.error(c, 'Image URL is required', 400, 'VALIDATION_ERROR');
  }
  
  const image = await productsRepository.addImage(productId, {
    url,
    altText,
    description,
    sortOrder,
    isPrimary,
  });
  
  return ResponseBuilder.created(c, image);
});

// Blog post CRUD endpoints
adminRoutes.get('/blog', authMiddleware, async (c) => {
  const page = Number(c.req.query('page') || '1');
  const limit = Number(c.req.query('limit') || '20');
  const search = c.req.query('search');
  const status = c.req.query('status');
  const sortBy = c.req.query('sortBy');
  const sortOrder = (c.req.query('sortOrder') || 'desc') as 'asc' | 'desc';

  const result = await blogDomain.getAllBlogPosts({
    page,
    limit,
    search,
    status,
    sortBy,
    sortOrder,
  });

  return ResponseBuilder.success(c, result);
});

adminRoutes.get('/blog/:id', authMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  const post = await blogDomain.getBlogPostById(id);
  return ResponseBuilder.success(c, post);
});

adminRoutes.post('/blog', authMiddleware, validateJson(createBlogPostSchema), async (c) => {
  const data = await c.req.json();
  const post = await blogDomain.createBlogPost(data);
  return ResponseBuilder.created(c, post);
});

adminRoutes.put('/blog/:id', authMiddleware, validateJson(updateBlogPostSchema), async (c) => {
  const id = Number(c.req.param('id'));
  const data = await c.req.json();
  const post = await blogDomain.updateBlogPost(id, data);
  return ResponseBuilder.success(c, post);
});

adminRoutes.delete('/blog/:id', authMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  await blogDomain.deleteBlogPost(id);
  return ResponseBuilder.noContent(c);
});

// Coupon CRUD endpoints
adminRoutes.get('/coupons', authMiddleware, async (c) => {
  const page = Number(c.req.query('page') || '1');
  const limit = Number(c.req.query('limit') || '20');
  const search = c.req.query('search');
  const status = c.req.query('status');
  const sortBy = c.req.query('sortBy');
  const sortOrder = (c.req.query('sortOrder') || 'desc') as 'asc' | 'desc';

  const result = await couponsDomain.getAllCoupons({
    page,
    limit,
    search,
    status,
    sortBy,
    sortOrder,
  });

  return ResponseBuilder.success(c, result);
});

adminRoutes.get('/coupons/:id', authMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  const coupon = await couponsDomain.getCouponById(id);
  return ResponseBuilder.success(c, coupon);
});

adminRoutes.post('/coupons', authMiddleware, validateJson(createCouponSchema), async (c) => {
  const data = await c.req.json();
  const coupon = await couponsDomain.createCoupon(data);
  return ResponseBuilder.created(c, coupon);
});

adminRoutes.put('/coupons/:id', authMiddleware, validateJson(updateCouponSchema), async (c) => {
  const id = Number(c.req.param('id'));
  const data = await c.req.json();
  const coupon = await couponsDomain.updateCoupon(id, data);
  return ResponseBuilder.success(c, coupon);
});

adminRoutes.patch('/coupons/:id/deactivate', authMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  const coupon = await couponsDomain.deactivateCoupon(id);
  return ResponseBuilder.success(c, coupon);
});

adminRoutes.get('/coupons/:id/stats', authMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  const stats = await couponsDomain.getCouponUsageStats(id);
  return ResponseBuilder.success(c, stats);
});

export default adminRoutes;
