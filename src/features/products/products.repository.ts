import { db } from '../../core/database';
import { products, productVariants, productImages, productCategories, productTags, categories } from '../../core/database/schema/products.schema';
import { eq, ilike, and, sql, desc, asc, isNull, or, inArray, gte, lte, count } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../../core/errors';
import type { CreateProductInput, UpdateProductInput, InventoryValidationItem, ProductFilterParams, PaginatedProducts, Category, PriceRange } from './products.interface';

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
        sortBy === 'soldCount' ? products.soldCount :
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

  async findById(id: string) {
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

  async update(id: string, data: UpdateProductInput) {
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

  async softDelete(id: string) {
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

  async addImage(productId: string, imageData: {
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

  async getImages(productId: string) {
    return await db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.sortOrder));
  }

  async updateImage(imageId: string, data: {
    altText?: string;
    description?: string;
    sortOrder?: number;
    isPrimary?: boolean;
  }) {
    // If setting as primary, unset other primary images for this product
    if (data.isPrimary) {
      const image = await db
        .select({ productId: productImages.productId })
        .from(productImages)
        .where(eq(productImages.id, imageId))
        .limit(1);

      if (image.length) {
        await db
          .update(productImages)
          .set({ isPrimary: false })
          .where(eq(productImages.productId, image[0].productId));
      }
    }

    const result = await db
      .update(productImages)
      .set(data)
      .where(eq(productImages.id, imageId))
      .returning();

    if (!result.length) {
      throw new NotFoundError('Product Image');
    }

    return result[0];
  }

  async deleteImage(imageId: string) {
    const result = await db
      .delete(productImages)
      .where(eq(productImages.id, imageId))
      .returning();

    if (!result.length) {
      throw new NotFoundError('Product Image');
    }

    return result[0];
  }

  async getRelatedProducts(productId: string, limit: number = 4) {
    // Get the product's categories
    const productCats = await db
      .select({ categoryId: productCategories.categoryId })
      .from(productCategories)
      .where(eq(productCategories.productId, productId));

    if (productCats.length === 0) {
      // No categories, return empty array
      return [];
    }

    const categoryIds = productCats.map(pc => pc.categoryId);

    // Find other products in the same categories
    const relatedProductIds = await db
      .select({ productId: productCategories.productId })
      .from(productCategories)
      .where(
        and(
          inArray(productCategories.categoryId, categoryIds),
          sql`${productCategories.productId} != ${productId}`
        )
      )
      .groupBy(productCategories.productId)
      .limit(limit);

    if (relatedProductIds.length === 0) {
      return [];
    }

    const ids = relatedProductIds.map(r => r.productId);

    // Get the actual products
    const relatedProducts = await db
      .select()
      .from(products)
      .where(
        and(
          inArray(products.id, ids),
          eq(products.status, 'active'),
          isNull(products.deletedAt)
        )
      )
      .limit(limit);

    // Get images for each product
    const productsWithImages = await Promise.all(
      relatedProducts.map(async (product) => {
        const images = await this.getImages(product.id);
        return { ...product, images };
      })
    );

    return productsWithImages;
  }

  async validateInventory(items: InventoryValidationItem[]) {
    const validationResults = [];

    for (const item of items) {
      if (item.variantId) {
        // Validate variant inventory
        const variant = await db
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, item.variantId))
          .limit(1);

        if (!variant.length) {
          validationResults.push({
            productId: item.productId,
            variantId: item.variantId,
            requestedQuantity: item.quantity,
            availableQuantity: 0,
            isAvailable: false,
            message: 'Variant not found',
          });
          continue;
        }

        const availableStock = variant[0].stockQuantity ?? 0;
        const isAvailable = availableStock >= item.quantity;

        validationResults.push({
          productId: item.productId,
          variantId: item.variantId,
          requestedQuantity: item.quantity,
          availableQuantity: availableStock,
          isAvailable,
          message: isAvailable ? 'Available' : `Only ${availableStock} items available`,
        });
      } else {
        // Validate product inventory (sum of all variants)
        const variants = await db
          .select()
          .from(productVariants)
          .where(eq(productVariants.productId, item.productId));

        if (!variants.length) {
          validationResults.push({
            productId: item.productId,
            requestedQuantity: item.quantity,
            availableQuantity: 0,
            isAvailable: false,
            message: 'No variants available',
          });
          continue;
        }

        const totalStock = variants.reduce((sum, v) => sum + (v.stockQuantity ?? 0), 0);
        const isAvailable = totalStock >= item.quantity;

        validationResults.push({
          productId: item.productId,
          requestedQuantity: item.quantity,
          availableQuantity: totalStock,
          isAvailable,
          message: isAvailable ? 'Available' : `Only ${totalStock} items available`,
        });
      }
    }

    return validationResults;
  }

  /**
   * Get products with advanced filtering and pagination
   */
  async getProductsWithFilters(params: ProductFilterParams): Promise<PaginatedProducts> {
    const {
      search,
      categories: categoryIds,
      minPrice,
      maxPrice,
      page = 1,
      limit = 24,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = params;

    // Build dynamic WHERE clause
    const conditions = [isNull(products.deletedAt), eq(products.status, 'active')];

    // Search across name, description, and tags
    if (search) {
      conditions.push(
        or(
          ilike(products.name, `%${search}%`),
          ilike(products.description, `%${search}%`),
          ilike(products.shortDescription, `%${search}%`)
        )!
      );
    }

    // Price range filtering
    if (minPrice !== undefined) {
      conditions.push(gte(products.basePrice, minPrice));
    }

    if (maxPrice !== undefined) {
      conditions.push(lte(products.basePrice, maxPrice));
    }

    const whereClause = and(...conditions);

    // If category filtering is needed, we need to join with productCategories
    let query;
    let countQuery;

    if (categoryIds && categoryIds.length > 0) {
      // Query with category filtering
      query = db
        .selectDistinct({
          id: products.id,
          name: products.name,
          slug: products.slug,
          subtitle: products.subtitle,
          description: products.description,
          shortDescription: products.shortDescription,
          basePrice: products.basePrice,
          compareAtPrice: products.compareAtPrice,
          productType: products.productType,
          status: products.status,
          featured: products.featured,
          metaTitle: products.metaTitle,
          metaDescription: products.metaDescription,
          rating: products.rating,
          reviewCount: products.reviewCount,
          viewCount: products.viewCount,
          soldCount: products.soldCount,
          trackInventory: products.trackInventory,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
          publishedAt: products.publishedAt,
          deletedAt: products.deletedAt,
        })
        .from(products)
        .innerJoin(productCategories, eq(products.id, productCategories.productId))
        .where(
          and(
            whereClause,
            inArray(productCategories.categoryId, categoryIds)
          )
        );

      countQuery = db
        .selectDistinct({ productId: products.id })
        .from(products)
        .innerJoin(productCategories, eq(products.id, productCategories.productId))
        .where(
          and(
            whereClause,
            inArray(productCategories.categoryId, categoryIds)
          )
        );
    } else {
      // Query without category filtering
      query = db
        .select()
        .from(products)
        .where(whereClause);

      countQuery = db
        .select({ count: count() })
        .from(products)
        .where(whereClause);
    }

    // Apply sorting
    const orderByColumn = sortBy === 'name' ? products.name :
      sortBy === 'price' ? products.basePrice :
        products.createdAt;

    const orderByFn = sortOrder === 'asc' ? asc : desc;

    // Execute query with pagination
    const offset = (page - 1) * limit;

    const [items, totalCountResult] = await Promise.all([
      query
        .orderBy(orderByFn(orderByColumn))
        .limit(limit)
        .offset(offset),
      countQuery
    ]);

    // Calculate total count
    let total: number;
    if (categoryIds && categoryIds.length > 0) {
      // For category queries, count distinct products
      total = totalCountResult.length;
    } else {
      // For non-category queries, use the count result
      total = Number((totalCountResult[0] as any)?.count || 0);
    }

    return {
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get all available product categories
   */
  async getCategories(): Promise<Category[]> {
    return db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.name));
  }

  /**
   * Get min and max prices for price range filter
   */
  async getPriceRange(): Promise<PriceRange> {
    const result = await db
      .select({
        min: sql<number>`MIN(${products.basePrice})`,
        max: sql<number>`MAX(${products.basePrice})`
      })
      .from(products)
      .where(
        and(
          isNull(products.deletedAt),
          eq(products.status, 'active')
        )
      );

    return {
      min: result[0]?.min || 0,
      max: result[0]?.max || 0
    };
  }
}

export const productsRepository = new ProductsRepository();
