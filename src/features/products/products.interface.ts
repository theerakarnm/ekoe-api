import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required'),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  basePrice: z.number().min(0, 'Price must be positive'),
  compareAtPrice: z.number().optional(),
  productType: z.enum(['single', 'set', 'bundle']),
  status: z.enum(['draft', 'active', 'archived']),
  featured: z.boolean().default(false),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  trackInventory: z.boolean().default(true),
  // Additional product details
  ingredients: z.object({
    keyIngredients: z.array(z.object({
      name: z.string(),
      description: z.string(),
    })).optional(),
    fullList: z.string().optional(),
    image: z.string().optional(),
  }).optional(),
  howToUse: z.object({
    steps: z.array(z.object({
      title: z.string(),
      description: z.string(),
      icon: z.string().optional(),
    })).optional(),
    proTips: z.array(z.string()).optional(),
    note: z.string().optional(),
    mediaUrl: z.string().optional(),
    mediaType: z.enum(['image', 'video']).optional(),
  }).optional(),
  complimentaryGift: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    image: z.string().optional(),
    value: z.string().optional(),
  }).optional(),

  // Set items (for product sets)
  setItems: z.array(z.object({
    productId: z.string(),
    quantity: z.number().min(1).default(1),
  })).optional(),

  // Key benefits
  benefits: z.array(z.string()).optional(),

  realUserReviews: z.object({
    image: z.string().optional(),
    content: z.string().optional(),
  }).optional(),
  goodFor: z.string().optional(),
  whyItWorks: z.string().optional(),
  feelsLike: z.string().optional(),
  smellsLike: z.string().optional(),
  tags: z.array(z.string()).optional(),
  ctaBackgroundUrl: z.string().optional().or(z.literal('')),
  ctaBackgroundType: z.enum(['image', 'video']).optional().or(z.literal('')).nullable(),
});

export const updateProductSchema = createProductSchema.partial();

export const createProductVariantSchema = z.object({
  variantType: z.string().min(1, 'Variant type is required').default('Size'),
  name: z.string().min(1, 'Name is required'),
  value: z.string().min(1, 'Value is required'),
  sku: z.string().optional(),
  price: z.number().min(0, 'Price must be positive'),
  compareAtPrice: z.number().optional(),
  stockQuantity: z.number().default(0),
  lowStockThreshold: z.number().default(10),
  isActive: z.boolean().default(true),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateProductVariantInput = z.infer<typeof createProductVariantSchema>;

// Inventory validation types
export interface InventoryValidationItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface InventoryValidationResult {
  productId: string;
  variantId?: string;
  requestedQuantity: number;
  availableQuantity: number;
  isAvailable: boolean;
  message: string;
}

export const validateInventorySchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    variantId: z.string().optional(),
    quantity: z.number().min(1),
  })),
});

// Product filtering types
export interface ProductFilterParams {
  search?: string;
  categories?: string[];
  minPrice?: number;
  maxPrice?: number;
  productType?: 'single' | 'set' | 'bundle';
  page?: number;
  limit?: number;
  sortBy?: 'price' | 'createdAt' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedProducts {
  data: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number | null;
  isActive: boolean | null;
}

export interface PriceRange {
  min: number;
  max: number;
}

// Bulk sequence update types
export const bulkUpdateSortOrderSchema = z.object({
  updates: z.array(z.object({
    productId: z.string(),
    sortOrder: z.number().int().min(0),
  })).min(1),
});

export const updateSingleSortOrderSchema = z.object({
  sortOrder: z.number().int().min(0),
});

export type BulkUpdateSortOrderInput = z.infer<typeof bulkUpdateSortOrderSchema>;
export type UpdateSingleSortOrderInput = z.infer<typeof updateSingleSortOrderSchema>;

