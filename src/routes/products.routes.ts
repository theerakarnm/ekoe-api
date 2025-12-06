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

// Public endpoint to get all available product categories
productsRoutes.get('/categories', optionalAuth, async (c) => {
  // Call domain method to get categories
  const categories = await productsDomain.getCategories();
  
  // Return categories array
  return ResponseBuilder.success(c, categories);
});

// Public endpoint to get price range for filters
productsRoutes.get('/price-range', optionalAuth, async (c) => {
  // Call domain method to get price range
  const priceRange = await productsDomain.getPriceRange();
  
  // Return min and max prices
  return ResponseBuilder.success(c, priceRange);
});

// Public endpoint to list all active products with filtering (with optional auth for enhanced features)
productsRoutes.get('/', optionalAuth, async (c) => {
  // Parse query parameters for filtering
  const search = c.req.query('search');
  const categoriesParam = c.req.query('categories');
  const minPriceParam = c.req.query('minPrice');
  const maxPriceParam = c.req.query('maxPrice');
  const pageParam = c.req.query('page');
  const limitParam = c.req.query('limit');
  const sortBy = c.req.query('sortBy') as 'price' | 'createdAt' | 'name' | undefined;
  const sortOrder = c.req.query('sortOrder') as 'asc' | 'desc' | undefined;

  // Build filter parameters
  const filterParams: any = {};

  if (search) {
    filterParams.search = search;
  }

  if (categoriesParam) {
    // Split comma-separated category IDs
    filterParams.categories = categoriesParam.split(',').filter(id => id.trim().length > 0);
  }

  if (minPriceParam) {
    const minPrice = parseFloat(minPriceParam);
    if (!isNaN(minPrice)) {
      filterParams.minPrice = minPrice;
    }
  }

  if (maxPriceParam) {
    const maxPrice = parseFloat(maxPriceParam);
    if (!isNaN(maxPrice)) {
      filterParams.maxPrice = maxPrice;
    }
  }

  if (pageParam) {
    const page = parseInt(pageParam);
    if (!isNaN(page)) {
      filterParams.page = page;
    }
  }

  if (limitParam) {
    const limit = parseInt(limitParam);
    if (!isNaN(limit)) {
      filterParams.limit = limit;
    }
  }

  if (sortBy) {
    filterParams.sortBy = sortBy;
  }

  if (sortOrder) {
    filterParams.sortOrder = sortOrder;
  }

  // Call domain method with parsed parameters
  const result = await productsDomain.getProductsWithFilters(filterParams);

  // Return paginated response with products and metadata
  return ResponseBuilder.success(c, result);
});

// Public endpoint to get related products for a specific product
productsRoutes.get('/:id/related', optionalAuth, async (c) => {
  try {
    // Extract product ID from route params
    const id = c.req.param('id');
    
    // Parse limit query parameter (default 4)
    const limitParam = c.req.query('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 4;
    
    // Validate limit is a positive number
    if (isNaN(limit) || limit < 1) {
      return ResponseBuilder.error(c, 'Invalid limit parameter', 400, 'INVALID_PARAMETER');
    }
    
    // Call domain method to get related products
    const relatedProducts = await productsDomain.getRelatedProducts(id, limit);
    
    // Return success response with products array
    return ResponseBuilder.success(c, relatedProducts);
  } catch (error: any) {
    // Handle errors with appropriate status codes
    if (error.code === 'NOT_FOUND') {
      return ResponseBuilder.error(c, 'Product not found', 404, 'NOT_FOUND');
    }
    
    // Handle other errors
    return ResponseBuilder.error(c, error.message || 'Failed to fetch related products', 500, 'INTERNAL_ERROR');
  }
});

// Public endpoint to get frequently bought together products
productsRoutes.get('/:id/frequently-bought-together', optionalAuth, async (c) => {
  try {
    // Extract product ID from route params
    const id = c.req.param('id');
    
    // Call domain method to get bundle
    const bundle = await productsDomain.getFrequentlyBoughtTogether(id);
    
    // Return success response with products, totalPrice, and savings
    // Handle empty results (return empty bundle)
    return ResponseBuilder.success(c, bundle);
  } catch (error: any) {
    // Handle errors appropriately
    if (error.code === 'NOT_FOUND') {
      return ResponseBuilder.error(c, 'Product not found', 404, 'NOT_FOUND');
    }
    
    // Handle other errors
    return ResponseBuilder.error(c, error.message || 'Failed to fetch frequently bought together products', 500, 'INTERNAL_ERROR');
  }
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
