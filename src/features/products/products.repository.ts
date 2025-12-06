import { db } from '../../core/database';
import { products, productVariants, productImages, productCategories, productTags, categories } from '../../core/database/schema/products.schema';
import { orderItems } from '../../core/database/schema/orders.schema';
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

    const productIds = result.map(p => p.id);

    // Get images for these products
    const imagesMap = new Map<string, {
      productId: string;
      url: string;
      altText?: string | null;
      description?: string | null;
      isPrimary: boolean | null;
      createdAt: string;
    }[]>();

    if (productIds.length > 0) {
      const images = await db
        .select({
          productId: productImages.productId,
          url: productImages.url,
          altText: productImages.altText,
          description: productImages.description,
          isPrimary: productImages.isPrimary,
          createdAt: productImages.createdAt
        })
        .from(productImages)
        .where(inArray(productImages.productId, productIds))
        .orderBy(asc(productImages.sortOrder));

      for (const img of images) {
        if (!imagesMap.has(img.productId)) {
          imagesMap.set(img.productId, []);
        }
        imagesMap.get(img.productId)?.push({
          ...img,
          createdAt: img.createdAt.toISOString(),
        });
      }
    }

    const productsWithImages = result.map(p => ({
      ...p,
      images: imagesMap.get(p.id) || []
    }));

    return { products: productsWithImages, total };
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
    // Get the source product with its categories and tags
    const sourceProduct = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, productId),
          isNull(products.deletedAt)
        )
      )
      .limit(1);

    if (!sourceProduct.length) {
      return [];
    }

    const product = sourceProduct[0];

    // Get the product's categories
    const productCats = await db
      .select({ categoryId: productCategories.categoryId })
      .from(productCategories)
      .where(eq(productCategories.productId, productId));

    if (productCats.length === 0) {
      return [];
    }

    const categoryIds = productCats.map(pc => pc.categoryId);

    // Get the product's tags
    const productTagsResult = await db
      .select({ tagId: productTags.tagId })
      .from(productTags)
      .where(eq(productTags.productId, productId));

    const tagIds = productTagsResult.map(pt => pt.tagId);

    // Find other products in the same categories
    const candidateProductIds = await db
      .selectDistinct({ productId: productCategories.productId })
      .from(productCategories)
      .where(
        and(
          inArray(productCategories.categoryId, categoryIds),
          sql`${productCategories.productId} != ${productId}`
        )
      );

    if (candidateProductIds.length === 0) {
      return [];
    }

    const candidateIds = candidateProductIds.map(r => r.productId);

    // Get candidate products with their tags for scoring
    const candidateProducts = await db
      .select()
      .from(products)
      .where(
        and(
          inArray(products.id, candidateIds),
          eq(products.status, 'active'),
          isNull(products.deletedAt)
        )
      );

    // Get tags for all candidate products
    const candidateTagsMap = new Map<string, string[]>();
    if (candidateProducts.length > 0) {
      const allCandidateTags = await db
        .select({
          productId: productTags.productId,
          tagId: productTags.tagId
        })
        .from(productTags)
        .where(inArray(productTags.productId, candidateProducts.map(p => p.id)));

      for (const tag of allCandidateTags) {
        if (!candidateTagsMap.has(tag.productId)) {
          candidateTagsMap.set(tag.productId, []);
        }
        candidateTagsMap.get(tag.productId)!.push(tag.tagId);
      }
    }

    // Calculate scores for each candidate
    const scoredProducts = candidateProducts.map(candidate => {
      let score = 0;

      // Category match: 50% (already guaranteed since we filtered by category)
      score += 50;

      // Tag overlap: 30%
      const candidateTags = candidateTagsMap.get(candidate.id) || [];
      if (tagIds.length > 0 && candidateTags.length > 0) {
        const tagOverlap = candidateTags.filter(t => tagIds.includes(t)).length;
        const tagScore = (tagOverlap / Math.max(tagIds.length, 1)) * 30;
        score += tagScore;
      }

      // Price similarity: 20%
      const priceDiff = Math.abs(candidate.basePrice - product.basePrice);
      const priceScore = 20 * (1 - priceDiff / Math.max(product.basePrice, 1));
      score += Math.max(0, priceScore);

      return { product: candidate, score };
    });

    // Sort by score descending and take top results
    scoredProducts.sort((a, b) => b.score - a.score);
    const topProducts = scoredProducts.slice(0, limit).map(sp => sp.product);

    // Get images for each product
    const productsWithImages = await Promise.all(
      topProducts.map(async (product) => {
        const images = await this.getImages(product.id);
        return { ...product, images };
      })
    );

    return productsWithImages;
  }

  async getFrequentlyBoughtTogether(productId: string, limit: number = 3) {
    // Find orders containing this product
    const ordersWithProduct = await db
      .selectDistinct({ orderId: orderItems.orderId })
      .from(orderItems)
      .where(eq(orderItems.productId, productId));

    if (ordersWithProduct.length === 0) {
      return [];
    }

    const orderIds = ordersWithProduct.map(o => o.orderId);

    // Find other products in those orders and count frequency
    const coProducts = await db
      .select({
        productId: orderItems.productId,
        frequency: count(orderItems.productId).as('frequency')
      })
      .from(orderItems)
      .where(
        and(
          inArray(orderItems.orderId, orderIds),
          sql`${orderItems.productId} != ${productId}`,
          sql`${orderItems.productId} IS NOT NULL`
        )
      )
      .groupBy(orderItems.productId)
      .orderBy(desc(sql`frequency`))
      .limit(limit);

    if (coProducts.length === 0) {
      return [];
    }

    const productIds = coProducts.map(cp => cp.productId).filter((id): id is string => id !== null);

    // Fetch full product details
    const productDetails = await db
      .select()
      .from(products)
      .where(
        and(
          inArray(products.id, productIds),
          eq(products.status, 'active'),
          isNull(products.deletedAt)
        )
      );

    // Get images for each product
    const productsWithImages = await Promise.all(
      productDetails.map(async (product) => {
        const images = await this.getImages(product.id);
        return { ...product, images };
      })
    );

    // Map back to include frequency and maintain order
    const result = coProducts
      .map(cp => {
        const product = productsWithImages.find(p => p.id === cp.productId);
        if (!product) return null;
        return {
          product,
          frequency: Number(cp.frequency)
        };
      })
      .filter((item): item is { product: any; frequency: number } => item !== null);

    return result;
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

    // Get images for these products
    const productIds = items.map(p => p.id);
    const imagesMap = new Map<string, {
      productId: string;
      url: string;
      altText?: string | null;
      description?: string | null;
      isPrimary: boolean | null;
      createdAt: string;
    }[]>();

    if (productIds.length > 0) {
      const images = await db
        .select({
          productId: productImages.productId,
          url: productImages.url,
          altText: productImages.altText,
          description: productImages.description,
          isPrimary: productImages.isPrimary,
          createdAt: productImages.createdAt
        })
        .from(productImages)
        .where(inArray(productImages.productId, productIds))
        .orderBy(asc(productImages.sortOrder));

      for (const img of images) {
        if (!imagesMap.has(img.productId)) {
          imagesMap.set(img.productId, []);
        }
        imagesMap.get(img.productId)?.push({
          ...img,
          createdAt: img.createdAt.toISOString(),
        });
      }
    }

    const productsWithImages = items.map(p => ({
      ...p,
      images: imagesMap.get(p.id) || []
    }));

    return {
      data: productsWithImages,
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
