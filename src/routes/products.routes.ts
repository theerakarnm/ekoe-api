import { Hono } from 'hono';
import { ResponseBuilder } from '../core/response';
import { productsDomain } from '../features/products/products.domain';

const productsRoutes = new Hono();

// Public endpoint to list all active products
productsRoutes.get('/', async (c) => {
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

// Public endpoint to get a single product by ID
productsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const product = await productsDomain.getProductById(id);

  // Only return if product is active
  if (product.status !== 'active') {
    return ResponseBuilder.error(c, 'Product not found', 404, 'NOT_FOUND');
  }

  return ResponseBuilder.success(c, product);
});

export default productsRoutes;
