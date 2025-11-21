import { blogRepository } from './blog.repository';
import type { CreateBlogPostInput, UpdateBlogPostInput } from './blog.interface';

export class BlogDomain {
  async getAllBlogPosts(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    return await blogRepository.findAll(params);
  }

  async getBlogPostById(id: number) {
    return await blogRepository.findById(id);
  }

  async createBlogPost(data: CreateBlogPostInput) {
    return await blogRepository.create(data);
  }

  async updateBlogPost(id: number, data: UpdateBlogPostInput) {
    return await blogRepository.update(id, data);
  }

  async deleteBlogPost(id: number) {
    return await blogRepository.softDelete(id);
  }
}

export const blogDomain = new BlogDomain();
