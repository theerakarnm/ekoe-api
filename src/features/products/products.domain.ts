import { productsRepository } from './products.repository';
import type { CreateProductInput, UpdateProductInput, InventoryValidationItem, InventoryValidationResult, ProductFilterParams, PaginatedProducts, Category, PriceRange } from './products.interface';
import { ValidationError } from '../../core/errors';

// Simple in-memory cache for related products
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, value: T, ttlSeconds: number): void {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { data: value, expiresAt });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  clear(): void {
    this.cache.clear();
  }
}

const cache = new SimpleCache();

export class ProductsDomain {
  /**
   * Validate and sanitize filter parameters
   */
  private validateFilters(params: ProductFilterParams): ProductFilterParams {
    const validated: ProductFilterParams = {};

    // Validate search query
    if (params.search) {
      const trimmed = params.search.trim();
      if (trimmed.length > 0) {
        // Limit search query to 100 characters
        validated.search = trimmed.substring(0, 100);
      }
    }

    // Validate category IDs array
    if (params.categories) {
      const categoryArray = Array.isArray(params.categories)
        ? params.categories
        : [params.categories];

      // Filter out invalid category IDs (empty strings, non-strings)
      const validCategories = categoryArray.filter(
        id => typeof id === 'string' && id.trim().length > 0
      );

      if (validCategories.length > 0) {
        validated.categories = validCategories;
      }
    }

    // Validate price range (non-negative numbers)
    if (params.minPrice !== undefined) {
      const min = Number(params.minPrice);
      if (!isNaN(min) && min >= 0) {
        validated.minPrice = min;
      }
    }

    if (params.maxPrice !== undefined) {
      const max = Number(params.maxPrice);
      if (!isNaN(max) && max >= 0) {
        validated.maxPrice = max;
      }
    }

    // Validate pagination parameters
    // Page must be >= 1
    const page = Number(params.page);
    validated.page = !isNaN(page) && page >= 1 ? page : 1;

    // Limit must be between 1 and 100
    const limit = Number(params.limit);
    if (!isNaN(limit) && limit >= 1 && limit <= 100) {
      validated.limit = limit;
    } else {
      validated.limit = 24; // Default limit
    }

    // Validate sort parameters
    if (params.sortBy && ['price', 'createdAt', 'name'].includes(params.sortBy)) {
      validated.sortBy = params.sortBy;
    }

    if (params.sortOrder && ['asc', 'desc'].includes(params.sortOrder)) {
      validated.sortOrder = params.sortOrder;
    }

    return validated;
  }
  async getAllProducts(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const result = await productsRepository.findAll(params);
    return {
      data: result.products,
      total: result.total,
      page: params.page,
      limit: params.limit,
    };
  }

  async getProductById(id: string) {
    return await productsRepository.findById(id);
  }

  async createProduct(data: CreateProductInput) {
    return await productsRepository.create(data);
  }

  async updateProduct(id: string, data: UpdateProductInput) {
    return await productsRepository.update(id, data);
  }

  async deleteProduct(id: string) {
    return await productsRepository.softDelete(id);
  }

  async getRelatedProducts(productId: string, limit: number = 4) {
    // Check cache first
    const cacheKey = `related:${productId}:${limit}`;
    const cached = cache.get<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

    // First verify the product exists
    await productsRepository.findById(productId);

    // Get related products based on shared categories
    const related = await productsRepository.getRelatedProducts(productId, limit);

    // Cache results for 1 hour (3600 seconds)
    cache.set(cacheKey, related, 3600);

    return related;
  }

  async getFrequentlyBoughtTogether(productId: string): Promise<{
    products: any[];
    totalPrice: number;
    savings: number;
  }> {
    // Get frequently bought together products from repository
    const result = await productsRepository.getFrequentlyBoughtTogether(productId, 3);

    // Handle empty results gracefully
    if (result.length === 0) {
      return {
        products: [],
        totalPrice: 0,
        savings: 0
      };
    }

    // Extract products from result
    const products = result.map(r => r.product);

    // Calculate total price by summing product base prices
    const totalPrice = products.reduce((sum, p) => sum + p.basePrice, 0);

    // Calculate 10% bundle discount (savings)
    const savings = Math.round(totalPrice * 0.1);

    // Return products array, total price (after discount), and savings
    return {
      products,
      totalPrice: totalPrice - savings,
      savings
    };
  }

  async updateProductImage(imageId: string, data: {
    altText?: string;
    description?: string;
    sortOrder?: number;
    isPrimary?: boolean;
  }) {
    return await productsRepository.updateImage(imageId, data);
  }

  async deleteProductImage(imageId: string) {
    return await productsRepository.deleteImage(imageId);
  }

  async validateInventory(items: InventoryValidationItem[]): Promise<{
    isValid: boolean;
    results: InventoryValidationResult[];
    errors: string[];
  }> {
    if (!items || items.length === 0) {
      throw new ValidationError('No items provided for validation');
    }

    const results = await productsRepository.validateInventory(items);

    // Check if all items are available
    const unavailableItems = results.filter(r => !r.isAvailable);
    const isValid = unavailableItems.length === 0;

    // Generate detailed error messages
    const errors = unavailableItems.map(item => {
      const productInfo = item.variantId
        ? `Product ${item.productId} (variant ${item.variantId})`
        : `Product ${item.productId}`;
      return `${productInfo}: ${item.message}`;
    });

    return {
      isValid,
      results,
      errors,
    };
  }

  /**
   * Get products with filters, validation, and pagination
   */
  async getProductsWithFilters(params: ProductFilterParams): Promise<PaginatedProducts> {
    try {
      // Validate and sanitize filter parameters
      const validatedParams = this.validateFilters(params);

      // Call repository with validated parameters
      const result = await productsRepository.getProductsWithFilters(validatedParams);

      // Format response with pagination metadata
      return {
        data: result.data,
        pagination: {
          page: result.pagination.page,
          limit: result.pagination.limit,
          total: result.pagination.total,
          totalPages: result.pagination.totalPages
        }
      };
    } catch (error) {
      // Handle edge cases and errors
      if (error instanceof ValidationError) {
        throw error;
      }

      // Log unexpected errors and rethrow
      console.error('Error fetching products with filters:', error);
      throw new Error('Failed to fetch products');
    }
  }

  /**
   * Get all available product categories
   */
  async getCategories(): Promise<Category[]> {
    try {
      const categories = await productsRepository.getCategories();

      // Add any necessary business logic or formatting
      // For now, return categories as-is
      return categories;
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw new Error('Failed to fetch categories');
    }
  }

  /**
   * Get price range for filter UI
   */
  async getPriceRange(): Promise<PriceRange> {
    try {
      const priceRange = await productsRepository.getPriceRange();

      // Add any necessary business logic or formatting
      // Ensure min is not greater than max
      if (priceRange.min > priceRange.max) {
        return { min: 0, max: 0 };
      }

      return priceRange;
    } catch (error) {
      console.error('Error fetching price range:', error);
      throw new Error('Failed to fetch price range');
    }
  }
}

export const productsDomain = new ProductsDomain();
