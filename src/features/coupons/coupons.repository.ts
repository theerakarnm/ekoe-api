import { db } from '../../core/database';
import { discountCodes, discountCodeUsage } from '../../core/database/schema/marketing.schema';
import { orders } from '../../core/database/schema/orders.schema';
import { eq, ilike, and, sql, desc, asc, or, lte, gte } from 'drizzle-orm';
import { NotFoundError, ConflictError } from '../../core/errors';
import type { CreateCouponInput, UpdateCouponInput } from './coupons.interface';

export class CouponsRepository {
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

    let conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(discountCodes.code, `%${search}%`),
          ilike(discountCodes.title, `%${search}%`)
        )!
      );
    }

    if (status === 'active') {
      conditions.push(eq(discountCodes.isActive, true));
    } else if (status === 'inactive') {
      conditions.push(eq(discountCodes.isActive, false));
    } else if (status === 'expired') {
      const now = new Date();
      conditions.push(
        and(
          eq(discountCodes.isActive, true),
          lte(discountCodes.expiresAt, now)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(discountCodes)
      .where(whereClause);

    const total = Number(countResult[0]?.count || 0);

    // Get coupons with sorting
    const orderByColumn = sortBy === 'code' ? discountCodes.code :
      sortBy === 'expiresAt' ? discountCodes.expiresAt :
        discountCodes.createdAt;

    const orderByFn = sortOrder === 'asc' ? asc : desc;

    const result = await db
      .select()
      .from(discountCodes)
      .where(whereClause)
      .orderBy(orderByFn(orderByColumn))
      .limit(limit)
      .offset(offset);

    return { data: result, total, page, limit };
  }

  async findById(id: string) {
    const result = await db
      .select()
      .from(discountCodes)
      .where(eq(discountCodes.id, id))
      .limit(1);

    if (!result.length) {
      throw new NotFoundError('Discount code');
    }

    return result[0];
  }

  async findByCode(code: string) {
    const result = await db
      .select()
      .from(discountCodes)
      .where(eq(discountCodes.code, code.toUpperCase()))
      .limit(1);

    return result[0];
  }

  async create(data: CreateCouponInput) {
    // Check if code already exists
    const existing = await this.findByCode(data.code);
    if (existing) {
      throw new ConflictError('Discount code already exists');
    }

    const result = await db
      .insert(discountCodes)
      .values({
        ...data,
        code: data.code.toUpperCase(),
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        updatedAt: new Date(),
      })
      .returning();

    return result[0];
  }

  async update(id: string, data: UpdateCouponInput) {
    // If code is being updated, check for conflicts
    if (data.code) {
      const existing = await this.findByCode(data.code);
      if (existing && existing.id !== id) {
        throw new ConflictError('Discount code already exists');
      }
    }

    const result = await db
      .update(discountCodes)
      .set({
        ...data,
        code: data.code ? data.code.toUpperCase() : undefined,
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(discountCodes.id, id))
      .returning();

    if (!result.length) {
      throw new NotFoundError('Discount code');
    }

    return result[0];
  }

  async deactivate(id: string) {
    const result = await db
      .update(discountCodes)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(discountCodes.id, id))
      .returning();

    if (!result.length) {
      throw new NotFoundError('Discount code');
    }

    return result[0];
  }

  async getUsageStats(id: string) {
    // Verify coupon exists
    await this.findById(id);

    // Get usage statistics
    const stats = await db
      .select({
        totalUses: sql<number>`COUNT(${discountCodeUsage.id})`,
        uniqueCustomers: sql<number>`COUNT(DISTINCT ${discountCodeUsage.userId})`,
        totalDiscountAmount: sql<number>`SUM(${discountCodeUsage.discountAmount})`,
      })
      .from(discountCodeUsage)
      .where(eq(discountCodeUsage.discountCodeId, id));

    // Get average order value for orders using this coupon
    const orderStats = await db
      .select({
        averageOrderValue: sql<number>`AVG(${orders.totalAmount})`,
      })
      .from(orders)
      .innerJoin(discountCodeUsage, eq(orders.id, discountCodeUsage.orderId))
      .where(eq(discountCodeUsage.discountCodeId, id));

    return {
      totalUses: Number(stats[0]?.totalUses || 0),
      uniqueCustomers: Number(stats[0]?.uniqueCustomers || 0),
      totalDiscountAmount: Number(stats[0]?.totalDiscountAmount || 0),
      averageOrderValue: Number(orderStats[0]?.averageOrderValue || 0),
    };
  }

  /**
   * Find the featured coupon for welcome popup
   * Returns the first active, valid featured coupon
   */
  async findFeatured() {
    const now = new Date();

    const result = await db
      .select()
      .from(discountCodes)
      .where(
        and(
          eq(discountCodes.isFeatured, true),
          eq(discountCodes.isActive, true),
          or(
            sql`${discountCodes.startsAt} IS NULL`,
            lte(discountCodes.startsAt, now)
          ),
          or(
            sql`${discountCodes.expiresAt} IS NULL`,
            gte(discountCodes.expiresAt, now)
          )
        )
      )
      .limit(1);

    return result[0] || null;
  }

  /**
   * Find coupons linked to a specific product
   * Returns active, valid coupons that have the product in linkedProductIds
   */
  async findByProductId(productId: string) {
    const now = new Date();

    const result = await db
      .select()
      .from(discountCodes)
      .where(
        and(
          eq(discountCodes.isActive, true),
          sql`${discountCodes.linkedProductIds} @> ${JSON.stringify([productId])}::jsonb`,
          or(
            sql`${discountCodes.startsAt} IS NULL`,
            lte(discountCodes.startsAt, now)
          ),
          or(
            sql`${discountCodes.expiresAt} IS NULL`,
            gte(discountCodes.expiresAt, now)
          )
        )
      );

    return result;
  }
}

export const couponsRepository = new CouponsRepository();
