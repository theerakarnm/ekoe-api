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
    return await productsRepository.findAll(params);
  }

  async getProductById(id: number) {
    return await productsRepository.findById(id);
  }

  async createProduct(data: CreateProductInput) {
    return await productsRepository.create(data);
  }

  async updateProduct(id: number, data: UpdateProductInput) {
    return await productsRepository.update(id, data);
  }

  async deleteProduct(id: number) {
    return await productsRepository.softDelete(id);
  }
}

export const productsDomain = new ProductsDomain();
