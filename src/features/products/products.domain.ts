import { productsRepository } from './products.repository';
import type { CreateProductInput, UpdateProductInput } from './products.interface';

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
}

export const productsDomain = new ProductsDomain();
