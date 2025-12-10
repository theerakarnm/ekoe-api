import { blogRepository } from './blog.repository';
import type { CreateBlogPostInput, UpdateBlogPostInput, ContentBlock } from './blog.interface';
import { generateTableOfContents } from './blog.interface';

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

  async getBlogPostById(id: string) {
    return await blogRepository.findById(id);
  }

  async createBlogPost(data: CreateBlogPostInput) {
    // Auto-generate table of contents from heading blocks
    const tableOfContents = data.contentBlocks
      ? generateTableOfContents(data.contentBlocks)
      : undefined;

    return await blogRepository.create({
      ...data,
      tableOfContents: tableOfContents as any,
    });
  }

  async updateBlogPost(id: string, data: UpdateBlogPostInput) {
    // Auto-generate table of contents from heading blocks
    const tableOfContents = data.contentBlocks
      ? generateTableOfContents(data.contentBlocks as ContentBlock[])
      : undefined;

    return await blogRepository.update(id, {
      ...data,
      ...(tableOfContents !== undefined && { tableOfContents: tableOfContents as any }),
    });
  }

  async deleteBlogPost(id: string) {
    return await blogRepository.softDelete(id);
  }
}

export const blogDomain = new BlogDomain();
