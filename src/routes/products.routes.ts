import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ResponseBuilder } from '../core/response';
import { productsDomain } from '../features/products/products.domain';
import { optionalAuth } from '../middleware/auth.middleware';
import { auth } from '../libs/auth';
import { validateInventorySchema } from '../features/products/products.interface';

const productsRoutes = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

// Public endpoint to list all active products (with optional auth for enhanced features)
productsRoutes.get('/', optionalAuth, async (c) => {
  const page = Number(c.req.query('page') || '1');
  const limit = Number(c.req.query('limit') || '20');
  const search = c.req.query('search');
  const sortBy = c.req.query('sortBy') || 'createdAt';
  const sortOrder = (c.req.query('sortOrder') || 'desc') as 'asc' | 'desc';

  // Only return active products for public API
  const result = await productsDomain.getAllProducts({
    page,
    limit,
    search,
    status: 'active',
    sortBy,
    sortOrder,
  });

  return ResponseBuilder.success(c, result);
});

// Public endpoint to get a single product by ID (with optional auth for enhanced features)
productsRoutes.get('/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const product = await productsDomain.getProductById(id);

  // Only return if product is active
  if (product.status !== 'active') {
    return ResponseBuilder.error(c, 'Product not found', 404, 'NOT_FOUND');
  }

  return ResponseBuilder.success(c, product);
});

// Public endpoint to get related products
productsRoutes.get('/related/:id', optionalAuth, async (c) => {
  const id = c.req.param('id');
  const limit = Number(c.req.query('limit') || '4');
  
  const relatedProducts = await productsDomain.getRelatedProducts(id, limit);
  
  return ResponseBuilder.success(c, relatedProducts);
});

// Public endpoint to validate inventory for cart items
productsRoutes.post('/validate-inventory', optionalAuth, zValidator('json', validateInventorySchema), async (c) => {
  const { items } = c.req.valid('json');
  
  const validation = await productsDomain.validateInventory(items);
  
  if (!validation.isValid) {
    return ResponseBuilder.error(c, 'Some items are not available', 400, 'INVENTORY_UNAVAILABLE', {
      results: validation.results,
      errors: validation.errors,
    });
  }
  
  return ResponseBuilder.success(c, validation);
});

export default productsRoutes;
