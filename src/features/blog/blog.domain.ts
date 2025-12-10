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
    const result = await blogRepository.findAll(params);
    return {
      data: result.posts,
      total: result.total,
      page: params.page,
      limit: params.limit,
    };
  }

  async getBlogPostById(id: string) {
    return await blogRepository.findById(id);
  }

  async createBlogPost(data: CreateBlogPostInput) {
    // Auto-generate table of contents from heading blocks
    const tableOfContents = data.contentBlocks
      ? generateTableOfContents(data.contentBlocks)
      : undefined;

    // Auto-set publishedAt when status is 'published'
    const publishedAt = data.status === 'published' ? new Date() : undefined;

    return await blogRepository.create({
      ...data,
      tableOfContents: tableOfContents as any,
      ...(publishedAt && { publishedAt }),
    });
  }

  async updateBlogPost(id: string, data: UpdateBlogPostInput) {
    // Auto-generate table of contents from heading blocks
    const tableOfContents = data.contentBlocks
      ? generateTableOfContents(data.contentBlocks as ContentBlock[])
      : undefined;

    // Auto-set publishedAt when status changes to 'published' (only if not already set)
    let publishedAt: Date | undefined;
    if (data.status === 'published') {
      const existingPost = await blogRepository.findById(id);
      if (!existingPost.publishedAt) {
        publishedAt = new Date();
      }
    }

    return await blogRepository.update(id, {
      ...data,
      ...(tableOfContents !== undefined && { tableOfContents: tableOfContents as any }),
      ...(publishedAt && { publishedAt }),
    });
  }

  async deleteBlogPost(id: string) {
    return await blogRepository.softDelete(id);
  }
}

export const blogDomain = new BlogDomain();
