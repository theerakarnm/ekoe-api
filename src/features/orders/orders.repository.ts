import { db } from '../../core/database';
import {
  orders,
  orderItems,
  shippingAddresses,
  billingAddresses,
  orderStatusHistory,
} from '../../core/database/schema/orders.schema';
import { products, productVariants } from '../../core/database/schema/products.schema';
import { eq, and, sql, desc, asc, ilike, or, gte } from 'drizzle-orm';
import { NotFoundError, AppError } from '../../core/errors';
import type {
  CreateOrderRequest,
  Order,
  OrderDetail,
  GetOrdersParams,
} from './orders.interface';

export class OrdersRepository {
  /**
   * Create a new order with transactional support
   * Handles order, items, addresses, and inventory atomically
   */
  async createOrder(data: CreateOrderRequest, orderData: {
    orderNumber: string;
    subtotal: number;
    shippingCost: number;
    taxAmount: number;
    discountAmount: number;
    totalAmount: number;
    items: Array<{
      productId: string;
      variantId?: string;
      productName: string;
      variantName?: string;
      sku?: string;
      unitPrice: number;
      quantity: number;
      subtotal: number;
      productSnapshot: any;
    }>;
  }): Promise<OrderDetail> {
    return await db.transaction(async (tx) => {
      // 1. Create order record
      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber: orderData.orderNumber,
          email: data.email,
          status: 'pending',
          paymentStatus: 'pending',
          fulfillmentStatus: 'unfulfilled',
          subtotal: orderData.subtotal,
          shippingCost: orderData.shippingCost,
          taxAmount: orderData.taxAmount,
          discountAmount: orderData.discountAmount,
          totalAmount: orderData.totalAmount,
          customerNote: data.customerNote,
          updatedAt: new Date(),
        })
        .returning();

      // 2. Create order items and update inventory
      const createdItems = [];
      for (const item of orderData.items) {
        // Create order item
        const [orderItem] = await tx
          .insert(orderItems)
          .values({
            orderId: order.id,
            productId: item.productId,
            variantId: item.variantId,
            productName: item.productName,
            variantName: item.variantName,
            sku: item.sku,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            subtotal: item.subtotal,
            productSnapshot: item.productSnapshot,
          })
          .returning();

        createdItems.push(orderItem);

        // Update inventory with optimistic locking
        if (item.variantId) {
          const result = await tx
            .update(productVariants)
            .set({
              stockQuantity: sql`${productVariants.stockQuantity} - ${item.quantity}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(productVariants.id, item.variantId),
                gte(productVariants.stockQuantity, item.quantity)
              )
            )
            .returning();

          if (result.length === 0) {
            throw new AppError(
              `Insufficient stock for ${item.productName}${item.variantName ? ` - ${item.variantName}` : ''}`,
              409,
              'INSUFFICIENT_STOCK'
            );
          }
        }

        // Update product sold count
        await tx
          .update(products)
          .set({
            soldCount: sql`${products.soldCount} + ${item.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, item.productId));
      }

      // 3. Create shipping address
      const [shippingAddr] = await tx
        .insert(shippingAddresses)
        .values({
          orderId: order.id,
          firstName: data.shippingAddress.firstName,
          lastName: data.shippingAddress.lastName,
          company: data.shippingAddress.company,
          addressLine1: data.shippingAddress.addressLine1,
          addressLine2: data.shippingAddress.addressLine2,
          city: data.shippingAddress.city,
          province: data.shippingAddress.province,
          postalCode: data.shippingAddress.postalCode,
          country: data.shippingAddress.country,
          phone: data.shippingAddress.phone,
        })
        .returning();

      // 4. Create billing address
      const [billingAddr] = await tx
        .insert(billingAddresses)
        .values({
          orderId: order.id,
          firstName: data.billingAddress.firstName,
          lastName: data.billingAddress.lastName,
          company: data.billingAddress.company,
          addressLine1: data.billingAddress.addressLine1,
          addressLine2: data.billingAddress.addressLine2,
          city: data.billingAddress.city,
          province: data.billingAddress.province,
          postalCode: data.billingAddress.postalCode,
          country: data.billingAddress.country,
          phone: data.billingAddress.phone,
        })
        .returning();

      // 5. Create initial status history
      await tx
        .insert(orderStatusHistory)
        .values({
          orderId: order.id,
          status: 'pending',
          note: 'Order created',
        });

      return {
        ...order,
        items: createdItems,
        shippingAddress: shippingAddr,
        billingAddress: billingAddr,
      };
    });
  }

  /**
   * Get orders with pagination and filtering
   */
  async getOrders(params: GetOrdersParams) {
    const {
      page,
      limit,
      status,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;
    const offset = (page - 1) * limit;

    let conditions = [];

    if (status) {
      conditions.push(eq(orders.status, status));
    }

    if (search) {
      conditions.push(
        or(
          ilike(orders.orderNumber, `%${search}%`),
          ilike(orders.email, `%${search}%`)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(whereClause);

    const total = Number(countResult[0]?.count || 0);

    // Get orders with sorting
    const orderByColumn =
      sortBy === 'orderNumber'
        ? orders.orderNumber
        : sortBy === 'email'
        ? orders.email
        : sortBy === 'status'
        ? orders.status
        : sortBy === 'totalAmount'
        ? orders.totalAmount
        : orders.createdAt;

    const orderByFn = sortOrder === 'asc' ? asc : desc;

    const result = await db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(orderByFn(orderByColumn))
      .limit(limit)
      .offset(offset);

    return { orders: result, total };
  }

  /**
   * Get order by ID with full details
   */
  async getOrderById(id: string): Promise<OrderDetail> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);

    if (!order) {
      throw new NotFoundError('Order');
    }

    // Get order items
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id));

    // Get shipping address
    const [shippingAddr] = await db
      .select()
      .from(shippingAddresses)
      .where(eq(shippingAddresses.orderId, id))
      .limit(1);

    // Get billing address
    const [billingAddr] = await db
      .select()
      .from(billingAddresses)
      .where(eq(billingAddresses.orderId, id))
      .limit(1);

    return {
      ...order,
      items,
      shippingAddress: shippingAddr || null,
      billingAddress: billingAddr || null,
    };
  }

  /**
   * Update order status with history tracking
   */
  async updateOrderStatus(
    id: string,
    status: string,
    note?: string,
    changedBy?: string
  ): Promise<Order> {
    return await db.transaction(async (tx) => {
      // Update order status
      const [order] = await tx
        .update(orders)
        .set({
          status,
          updatedAt: new Date(),
          ...(status === 'cancelled' && { cancelledAt: new Date() }),
          ...(status === 'shipped' && { shippedAt: new Date() }),
          ...(status === 'delivered' && { deliveredAt: new Date() }),
        })
        .where(eq(orders.id, id))
        .returning();

      if (!order) {
        throw new NotFoundError('Order');
      }

      // Create status history entry
      await tx.insert(orderStatusHistory).values({
        orderId: id,
        status,
        note,
        changedBy,
      });

      return order;
    });
  }

  /**
   * Get order status history
   */
  async getOrderStatusHistory(orderId: string) {
    return await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(desc(orderStatusHistory.createdAt));
  }
}

export const ordersRepository = new OrdersRepository();
