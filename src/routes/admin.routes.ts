import { Hono } from 'hono';
import { requireAdminAuth } from '../middleware/auth.middleware';
import { validateJson } from '../middleware/validation.middleware';
import { ResponseBuilder } from '../core/response';
import { productsDomain } from '../features/products/products.domain';
import { productsRepository } from '../features/products/products.repository';
import { createProductSchema, updateProductSchema } from '../features/products/products.interface';
import { blogDomain } from '../features/blog/blog.domain';
import { createBlogPostSchema, updateBlogPostSchema } from '../features/blog/blog.interface';
import { couponsDomain } from '../features/coupons/coupons.domain';
import { createCouponSchema, updateCouponSchema } from '../features/coupons/coupons.interface';
import { dashboardDomain } from '../features/dashboard/dashboard.domain';
import { usersDomain } from '../features/users/users.domain';
import { getCustomersParamsSchema } from '../features/users/users.interface';
import { auth } from '../libs/auth';

const adminRoutes = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null
  }
}>();

// Dashboard metrics endpoint
adminRoutes.get('/dashboard/metrics', requireAdminAuth, async (c) => {
  const metrics = await dashboardDomain.getMetrics();
  return ResponseBuilder.success(c, metrics);
});

// Product CRUD endpoints
adminRoutes.get('/products', requireAdminAuth, async (c) => {
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

adminRoutes.get('/products/:id', requireAdminAuth, async (c) => {
  const id = c.req.param('id');
  const product = await productsDomain.getProductById(id);
  return ResponseBuilder.success(c, product);
});

adminRoutes.post('/products', requireAdminAuth, validateJson(createProductSchema), async (c) => {
  const data = await c.req.json();
  const product = await productsDomain.createProduct(data);
  return ResponseBuilder.created(c, product);
});

adminRoutes.put('/products/:id', requireAdminAuth, validateJson(updateProductSchema), async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const product = await productsDomain.updateProduct(id, data);
  return ResponseBuilder.success(c, product);
});

adminRoutes.delete('/products/:id', requireAdminAuth, async (c) => {
  const id = c.req.param('id');
  await productsDomain.deleteProduct(id);
  return ResponseBuilder.noContent(c);
});

// Product image upload endpoint
adminRoutes.post('/products/:id/images', requireAdminAuth, async (c) => {
  const productId = c.req.param('id');

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
adminRoutes.get('/blog', requireAdminAuth, async (c) => {
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

adminRoutes.get('/blog/:id', requireAdminAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const post = await blogDomain.getBlogPostById(id);
  return ResponseBuilder.success(c, post);
});

adminRoutes.post('/blog', requireAdminAuth, validateJson(createBlogPostSchema), async (c) => {
  const data = await c.req.json();
  const post = await blogDomain.createBlogPost(data);
  return ResponseBuilder.created(c, post);
});

adminRoutes.put('/blog/:id', requireAdminAuth, validateJson(updateBlogPostSchema), async (c) => {
  const id = Number(c.req.param('id'));
  const data = await c.req.json();
  const post = await blogDomain.updateBlogPost(id, data);
  return ResponseBuilder.success(c, post);
});

adminRoutes.delete('/blog/:id', requireAdminAuth, async (c) => {
  const id = Number(c.req.param('id'));
  await blogDomain.deleteBlogPost(id);
  return ResponseBuilder.noContent(c);
});

// Coupon CRUD endpoints
adminRoutes.get('/coupons', requireAdminAuth, async (c) => {
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

adminRoutes.get('/coupons/:id', requireAdminAuth, async (c) => {
  const id = c.req.param('id');
  const coupon = await couponsDomain.getCouponById(id);
  return ResponseBuilder.success(c, coupon);
});

adminRoutes.post('/coupons', requireAdminAuth, validateJson(createCouponSchema), async (c) => {
  const data = await c.req.json();
  const coupon = await couponsDomain.createCoupon(data);
  return ResponseBuilder.created(c, coupon);
});

adminRoutes.put('/coupons/:id', requireAdminAuth, validateJson(updateCouponSchema), async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const coupon = await couponsDomain.updateCoupon(id, data);
  return ResponseBuilder.success(c, coupon);
});

adminRoutes.patch('/coupons/:id/deactivate', requireAdminAuth, async (c) => {
  const id = c.req.param('id');
  const coupon = await couponsDomain.deactivateCoupon(id);
  return ResponseBuilder.success(c, coupon);
});

adminRoutes.get('/coupons/:id/stats', requireAdminAuth, async (c) => {
  const id = c.req.param('id');
  const stats = await couponsDomain.getCouponUsageStats(id);
  return ResponseBuilder.success(c, stats);
});

// Customer management endpoints
adminRoutes.get('/customers', requireAdminAuth, async (c) => {
  const page = Number(c.req.query('page') || '1');
  const limit = Number(c.req.query('limit') || '20');
  const search = c.req.query('search');

  // Validate query parameters
  const params = getCustomersParamsSchema.parse({
    page,
    limit,
    search,
  });

  const result = await usersDomain.getCustomersWithStats(params);
  return ResponseBuilder.success(c, result);
});

adminRoutes.get('/customers/:id', requireAdminAuth, async (c) => {
  const id = c.req.param('id');
  const customer = await usersDomain.getCustomerWithOrderHistory(id);
  return ResponseBuilder.success(c, customer);
});

export default adminRoutes;
