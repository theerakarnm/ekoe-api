import { productsRepository } from './products.repository';
import type { CreateProductInput, UpdateProductInput, InventoryValidationItem, InventoryValidationResult } from './products.interface';
import { ValidationError } from '../../core/errors';

export class ProductsDomain {
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
    // First verify the product exists
    await productsRepository.findById(productId);
    
    // Get related products based on shared categories
    return await productsRepository.getRelatedProducts(productId, limit);
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
}

export const productsDomain = new ProductsDomain();
