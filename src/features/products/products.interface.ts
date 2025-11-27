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
});

export const updateProductSchema = createProductSchema.partial();

export const createProductVariantSchema = z.object({
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
