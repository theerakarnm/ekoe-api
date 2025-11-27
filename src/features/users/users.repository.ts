import { eq, isNull, or, ilike, sql, desc } from 'drizzle-orm';
import { db } from '../../core/database';
import { users } from '../../core/database/schema/auth-schema';
import { orders } from '../../core/database/schema/orders.schema';
import { CreateUserDto, UpdateUserDto, GetCustomersParams } from './users.interface';

export class UsersRepository {
  async findAll() {
    return db.select().from(users).where(isNull(users.deletedAt));
  }

  async findById(id: string) {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0] || null;
  }

  async findByEmail(email: string) {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0] || null;
  }

  async create(data: CreateUserDto) {
    const result = await db.insert(users).values(data).returning();
    return result[0];
  }

  async update(id: string, data: UpdateUserDto) {
    const result = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async delete(id: string) {
    // Soft delete
    const result = await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  /**
   * Get customers with order statistics
   * Includes order count and total spent for each customer
   */
  async getCustomersWithStats(params: GetCustomersParams) {
    const { page = 1, limit = 20, search } = params;
    const offset = (page - 1) * limit;

    // Build where conditions
    const whereConditions = [];
    
    if (search) {
      whereConditions.push(
        or(
          ilike(users.name, `%${search}%`),
          ilike(users.email, `%${search}%`)
        )
      );
    }

    // Get customers with aggregated order stats
    const customersQuery = db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        image: users.image,
        role: users.role,
        createdAt: users.createdAt,
        orderCount: sql<number>`CAST(COUNT(DISTINCT ${orders.id}) AS INTEGER)`,
        totalSpent: sql<number>`CAST(COALESCE(SUM(${orders.totalAmount}), 0) AS INTEGER)`,
      })
      .from(users)
      .leftJoin(orders, eq(users.id, orders.userId))
      .groupBy(users.id)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    // Apply search filter if provided
    if (whereConditions.length > 0) {
      customersQuery.where(whereConditions[0]);
    }

    const customers = await customersQuery;

    // Get total count for pagination
    const countQuery = db
      .select({ count: sql<number>`CAST(COUNT(DISTINCT ${users.id}) AS INTEGER)` })
      .from(users);

    if (whereConditions.length > 0) {
      countQuery.where(whereConditions[0]);
    }

    const [{ count }] = await countQuery;

    return {
      data: customers,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * Get customer details with order history
   * Includes full customer info and all their orders
   */
  async getCustomerWithOrderHistory(id: string) {
    // Get customer info
    const customer = await this.findById(id);
    if (!customer) {
      return null;
    }

    // Get customer's orders with basic details
    const customerOrders = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        email: orders.email,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        fulfillmentStatus: orders.fulfillmentStatus,
        subtotal: orders.subtotal,
        shippingCost: orders.shippingCost,
        taxAmount: orders.taxAmount,
        discountAmount: orders.discountAmount,
        totalAmount: orders.totalAmount,
        currency: orders.currency,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
        shippedAt: orders.shippedAt,
        deliveredAt: orders.deliveredAt,
      })
      .from(orders)
      .where(eq(orders.userId, id))
      .orderBy(desc(orders.createdAt));

    // Calculate statistics
    const orderCount = customerOrders.length;
    const totalSpent = customerOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    return {
      ...customer,
      orderCount,
      totalSpent,
      orders: customerOrders,
    };
  }
}

export const usersRepository = new UsersRepository();
