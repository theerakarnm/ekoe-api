import { db } from '../../core/database';
import { blogPosts } from '../../core/database/schema/marketing.schema';
import { eq, ilike, and, sql, desc, asc, isNull, or } from 'drizzle-orm';
import { NotFoundError } from '../../core/errors';
import type { CreateBlogPostInput, UpdateBlogPostInput } from './blog.interface';

export class BlogRepository {
  async findAll(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { page, limit, search, status, sortBy = 'createdAt', sortOrder = 'desc' } = params;
    const offset = (page - 1) * limit;

    let conditions = [isNull(blogPosts.deletedAt)];

    if (search) {
      conditions.push(
        or(
          ilike(blogPosts.title, `%${search}%`),
          ilike(blogPosts.slug, `%${search}%`)
        )!
      );
    }

    if (status) {
      conditions.push(eq(blogPosts.status, status));
    }

    const whereClause = and(...conditions);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(blogPosts)
      .where(whereClause);

    const total = Number(countResult[0]?.count || 0);

    // Get blog posts with sorting
    const orderByColumn = sortBy === 'title' ? blogPosts.title :
      sortBy === 'publishedAt' ? blogPosts.publishedAt :
        sortBy === 'viewCount' ? blogPosts.viewCount :
          sortBy === 'sortOrder' ? blogPosts.sortOrder :
            blogPosts.createdAt;

    const orderByFn = sortOrder === 'asc' ? asc : desc;

    // If no specific sort requested, use sortOrder ASC as primary, then createdAt DESC
    let result;
    if (!sortBy || sortBy === 'sortOrder') {
      result = await db
        .select()
        .from(blogPosts)
        .where(whereClause)
        .orderBy(asc(blogPosts.sortOrder), desc(blogPosts.createdAt))
        .limit(limit)
        .offset(offset);
    } else {
      result = await db
        .select()
        .from(blogPosts)
        .where(whereClause)
        .orderBy(orderByFn(orderByColumn))
        .limit(limit)
        .offset(offset);
    }

    return { posts: result, total };
  }

  async findById(id: string) {
    const result = await db
      .select()
      .from(blogPosts)
      .where(
        and(
          eq(blogPosts.id, id),
          isNull(blogPosts.deletedAt)
        )
      )
      .limit(1);

    if (!result.length) {
      throw new NotFoundError('Blog post');
    }

    return result[0];
  }

  async findBySlug(slug: string) {
    const result = await db
      .select()
      .from(blogPosts)
      .where(
        and(
          eq(blogPosts.slug, slug),
          isNull(blogPosts.deletedAt)
        )
      )
      .limit(1);

    if (!result.length) {
      throw new NotFoundError('Blog post');
    }

    return result[0];
  }

  async create(data: CreateBlogPostInput) {
    const result = await db
      .insert(blogPosts)
      .values({
        ...data,
        updatedAt: new Date(),
      })
      .returning();

    return result[0];
  }

  async update(id: string, data: UpdateBlogPostInput) {
    const result = await db
      .update(blogPosts)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(blogPosts.id, id),
          isNull(blogPosts.deletedAt)
        )
      )
      .returning();

    if (!result.length) {
      throw new NotFoundError('Blog post');
    }

    return result[0];
  }

  async softDelete(id: string) {
    const result = await db
      .update(blogPosts)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(blogPosts.id, id),
          isNull(blogPosts.deletedAt)
        )
      )
      .returning();

    if (!result.length) {
      throw new NotFoundError('Blog post');
    }

    return result[0];
  }

  async updateSortOrder(id: string, sortOrder: number) {
    const result = await db
      .update(blogPosts)
      .set({
        sortOrder,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(blogPosts.id, id),
          isNull(blogPosts.deletedAt)
        )
      )
      .returning();

    if (!result.length) {
      throw new NotFoundError('Blog post');
    }

    return result[0];
  }

  async bulkUpdateSortOrder(updates: { blogId: string; sortOrder: number }[]) {
    const results = [];

    for (const update of updates) {
      const result = await db
        .update(blogPosts)
        .set({
          sortOrder: update.sortOrder,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(blogPosts.id, update.blogId),
            isNull(blogPosts.deletedAt)
          )
        )
        .returning();

      if (result.length) {
        results.push(result[0]);
      }
    }

    return results;
  }
}

export const blogRepository = new BlogRepository();
