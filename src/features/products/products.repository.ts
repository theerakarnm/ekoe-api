import { db } from '../../core/database';
import { products, productVariants, productImages, productCategories, productTags } from '../../core/database/schema/products.schema';
import { eq, ilike, and, sql, desc, asc, isNull, or } from 'drizzle-orm';
import { NotFoundError } from '../../core/errors';
import type { CreateProductInput, UpdateProductInput } from './products.interface';

export class ProductsRepository {
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

    let conditions = [isNull(products.deletedAt)];

    if (search) {
      conditions.push(
        or(
          ilike(products.name, `%${search}%`),
          ilike(products.slug, `%${search}%`)
        )!
      );
    }

    if (status) {
      conditions.push(eq(products.status, status));
    }

    const whereClause = and(...conditions);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(whereClause);

    const total = Number(countResult[0]?.count || 0);

    // Get products with sorting
    const orderByColumn = sortBy === 'name' ? products.name :
                          sortBy === 'basePrice' ? products.basePrice :
                          products.createdAt;
    
    const orderByFn = sortOrder === 'asc' ? asc : desc;

    const result = await db
      .select()
      .from(products)
      .where(whereClause)
      .orderBy(orderByFn(orderByColumn))
      .limit(limit)
      .offset(offset);

    return { products: result, total };
  }

  async findById(id: number) {
    const result = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, id),
          isNull(products.deletedAt)
        )
      )
      .limit(1);

    if (!result.length) {
      throw new NotFoundError('Product');
    }

    // Get variants
    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, id));

    // Get images
    const images = await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, id))
      .orderBy(asc(productImages.sortOrder));

    return {
      ...result[0],
      variants,
      images,
    };
  }

  async create(data: CreateProductInput) {
    const result = await db
      .insert(products)
      .values({
        ...data,
        updatedAt: new Date(),
      })
      .returning();

    return result[0];
  }

  async update(id: number, data: UpdateProductInput) {
    const result = await db
      .update(products)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(products.id, id),
          isNull(products.deletedAt)
        )
      )
      .returning();

    if (!result.length) {
      throw new NotFoundError('Product');
    }

    return result[0];
  }

  async softDelete(id: number) {
    const result = await db
      .update(products)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(products.id, id),
          isNull(products.deletedAt)
        )
      )
      .returning();

    if (!result.length) {
      throw new NotFoundError('Product');
    }

    return result[0];
  }

  async addImage(productId: number, imageData: {
    url: string;
    altText?: string;
    description?: string;
    sortOrder?: number;
    isPrimary?: boolean;
  }) {
    const result = await db
      .insert(productImages)
      .values({
        productId,
        ...imageData,
      })
      .returning();

    return result[0];
  }

  async getImages(productId: number) {
    return await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.sortOrder));
  }
}

export const productsRepository = new ProductsRepository();
