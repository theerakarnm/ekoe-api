import { db } from '../../core/database';
import { products, productVariants, productImages, productCategories, productTags, categories } from '../../core/database/schema/products.schema';
import { eq, ilike, and, sql, desc, asc, isNull, or, inArray, gte } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../../core/errors';
import type { CreateProductInput, UpdateProductInput, InventoryValidationItem } from './products.interface';

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
}

export const productsRepository = new ProductsRepository();
