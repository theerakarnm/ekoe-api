import { db } from '../../core/database';
import { products, productVariants, complimentaryGifts, productGifts } from '../../core/database/schema/products.schema';
import { discountCodes, discountCodeUsage } from '../../core/database/schema/marketing.schema';
import { eq, and, isNull, lte, inArray, sql } from 'drizzle-orm';
import type { FreeGift } from './cart.interface';

export class CartRepository {
  /**
   * Validate products exist and are active
   */
  async validateProducts(productIds: string[]) {
    if (productIds.length === 0) {
      return [];
    }

    const result = await db
      .select()
      .from(products)
      .where(
        and(
          inArray(products.id, productIds),
          isNull(products.deletedAt),
          eq(products.status, 'active')
        )
      );

    return result;
  }

  /**
   * Validate variants exist and have stock
   */
  async validateVariants(variantIds: string[]) {
    if (variantIds.length === 0) {
      return [];
    }

    const result = await db
      .select()
      .from(productVariants)
      .where(
        and(
          inArray(productVariants.id, variantIds),
          eq(productVariants.isActive, true)
        )
      );

    return result;
  }

  /**
   * Get free gifts by conditions
   * Returns gifts that are eligible based on subtotal and/or product associations
   */
  async getEligibleGifts(subtotal: number, productIds: string[]): Promise<FreeGift[]> {
    // First, get gifts eligible by subtotal
    const subtotalGifts = await db
      .select()
      .from(complimentaryGifts)
      .where(
        and(
          eq(complimentaryGifts.isActive, true),
          lte(complimentaryGifts.minPurchaseAmount, subtotal)
        )
      );

    // Then, get gifts associated with products in cart (if any)
    let productSpecificGifts: typeof subtotalGifts = [];
    if (productIds.length > 0) {
      productSpecificGifts = await db
        .selectDistinct({
          id: complimentaryGifts.id,
          name: complimentaryGifts.name,
          description: complimentaryGifts.description,
          imageUrl: complimentaryGifts.imageUrl,
          value: complimentaryGifts.value,
          minPurchaseAmount: complimentaryGifts.minPurchaseAmount,
          isActive: complimentaryGifts.isActive,
          createdAt: complimentaryGifts.createdAt,
          updatedAt: complimentaryGifts.updatedAt,
        })
        .from(complimentaryGifts)
        .innerJoin(productGifts, eq(productGifts.giftId, complimentaryGifts.id))
        .where(
          and(
            eq(complimentaryGifts.isActive, true),
            inArray(productGifts.productId, productIds)
          )
        );
    }

    // Combine and deduplicate gifts
    const allGifts = [...subtotalGifts, ...productSpecificGifts];
    const uniqueGifts = Array.from(
      new Map(allGifts.map(gift => [gift.id, gift])).values()
    );

    // Get associated product IDs for each gift
    const giftIds = uniqueGifts.map(g => g.id);
    const giftProductAssociations = giftIds.length > 0
      ? await db
          .select({
            giftId: productGifts.giftId,
            productId: productGifts.productId,
          })
          .from(productGifts)
          .where(inArray(productGifts.giftId, giftIds))
      : [];

    // Group product IDs by gift ID
    const giftProductMap = new Map<string, string[]>();
    for (const assoc of giftProductAssociations) {
      if (!giftProductMap.has(assoc.giftId)) {
        giftProductMap.set(assoc.giftId, []);
      }
      giftProductMap.get(assoc.giftId)!.push(assoc.productId);
    }

    return uniqueGifts.map(gift => ({
      id: gift.id,
      name: gift.name,
      description: gift.description || '',
      imageUrl: gift.imageUrl || '',
      value: gift.value || 0,
      minPurchaseAmount: gift.minPurchaseAmount || undefined,
      associatedProductIds: giftProductMap.get(gift.id),
    }));
  }

  /**
   * Get discount code by code string
   */
  async getDiscountCodeByCode(code: string) {
    const [discountCode] = await db
      .select()
      .from(discountCodes)
      .where(
        and(
          eq(discountCodes.code, code.toUpperCase()),
          eq(discountCodes.isActive, true)
        )
      )
      .limit(1);

    return discountCode || null;
  }

  /**
   * Check discount code usage for customer
   */
  async getDiscountCodeUsageCount(codeId: string, userId?: string): Promise<number> {
    if (!userId) {
      // For guest users, we can't track per-customer usage
      return 0;
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(discountCodeUsage)
      .where(
        and(
          eq(discountCodeUsage.discountCodeId, codeId),
          eq(discountCodeUsage.userId, userId)
        )
      );

    return Number(result[0]?.count || 0);
  }

  /**
   * Get total usage count for a discount code
   */
  async getTotalDiscountCodeUsage(codeId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(discountCodeUsage)
      .where(eq(discountCodeUsage.discountCodeId, codeId));

    return Number(result[0]?.count || 0);
  }

  /**
   * Increment discount code usage
   * This should be called within a transaction during order creation
   */
  async incrementDiscountCodeUsage(codeId: string, discountAmount: number, orderId: string, userId?: string) {
    await db.insert(discountCodeUsage).values({
      discountCodeId: codeId,
      orderId: orderId,
      discountAmount: discountAmount,
      userId: userId || undefined,
    });
  }
}

export const cartRepository = new CartRepository();
