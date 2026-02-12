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

  async getBlogPostBySlug(slug: string) {
    return await blogRepository.findBySlug(slug);
  }

  /**
   * Get blog post by ID or slug (auto-detect)
   */
  async getBlogPostByIdOrSlug(identifier: string) {
    // UUID v7 format check
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(identifier)) {
      return await blogRepository.findById(identifier);
    }
    return await blogRepository.findBySlug(identifier);
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

  /**
   * Update a single blog post's sort order
   */
  async updateBlogSortOrder(id: string, sortOrder: number) {
    if (sortOrder < 0) {
      throw new Error('Sort order must be a non-negative number');
    }
    return await blogRepository.updateSortOrder(id, sortOrder);
  }

  /**
   * Bulk update blog post sort orders (for drag-and-drop reordering)
   */
  async bulkUpdateBlogSequences(updates: { blogId: string; sortOrder: number }[]) {
    if (!updates || updates.length === 0) {
      throw new Error('No updates provided');
    }

    // Validate all sort orders are non-negative
    for (const update of updates) {
      if (update.sortOrder < 0) {
        throw new Error(`Invalid sort order for blog ${update.blogId}: must be non-negative`);
      }
    }

    return await blogRepository.bulkUpdateSortOrder(updates);
  }
}

export const blogDomain = new BlogDomain();
