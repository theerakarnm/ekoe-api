import { ordersRepository } from './orders.repository';
import { db } from '../../core/database';
import { products, productVariants } from '../../core/database/schema/products.schema';
import { eq, and, isNull } from 'drizzle-orm';
import { ValidationError, NotFoundError, AppError } from '../../core/errors';
import type {
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  GetOrdersParams,
} from './orders.interface';

export class OrdersDomain {
  /**
   * Generate unique order number
   */
  private generateOrderNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ORD-${timestamp}-${random}`;
  }

  /**
   * Validate stock availability for order items
   */
  private async validateStockAvailability(
    items: Array<{ productId: string; variantId?: string; quantity: number }>
  ): Promise<void> {
    for (const item of items) {
      // Check if product exists and is active
      const [product] = await db
        .select()
        .from(products)
        .where(
          and(
            eq(products.id, item.productId),
            isNull(products.deletedAt),
            eq(products.status, 'active')
          )
        )
        .limit(1);

      if (!product) {
        throw new NotFoundError(`Product with ID ${item.productId}`);
      }

      // Check variant stock if variant is specified
      if (item.variantId) {
        const [variant] = await db
          .select()
          .from(productVariants)
          .where(
            and(
              eq(productVariants.id, item.variantId),
              eq(productVariants.productId, item.productId),
              eq(productVariants.isActive, true)
            )
          )
          .limit(1);

        if (!variant) {
          throw new NotFoundError(`Product variant with ID ${item.variantId}`);
        }

        const stockQuantity = variant.stockQuantity ?? 0;
        if (product.trackInventory && stockQuantity < item.quantity) {
          throw new ValidationError(
            `Insufficient stock for ${product.name}${variant.name ? ` - ${variant.name}` : ''}. Available: ${stockQuantity}, Requested: ${item.quantity}`,
            {
              productId: item.productId,
              variantId: item.variantId,
              available: stockQuantity,
              requested: item.quantity,
            }
          );
        }
      }
    }
  }

  /**
   * Validate address data
   */
  private validateAddress(address: any): void {
    const requiredFields = [
      'firstName',
      'lastName',
      'addressLine1',
      'city',
      'province',
      'postalCode',
      'country',
      'phone',
    ];

    for (const field of requiredFields) {
      if (!address[field] || address[field].trim() === '') {
        throw new ValidationError(`${field} is required in address`);
      }
    }
  }

  /**
   * Calculate order pricing
   */
  private async calculateOrderPricing(
    items: Array<{ productId: string; variantId?: string; quantity: number }>
  ): Promise<{
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
  }> {
    let subtotal = 0;
    const processedItems = [];

    for (const item of items) {
      // Get product details
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, item.productId))
        .limit(1);

      if (!product) {
        throw new NotFoundError(`Product with ID ${item.productId}`);
      }

      let unitPrice = product.basePrice;
      let variantName: string | undefined;
      let sku: string | undefined;

      // Get variant details if specified
      if (item.variantId) {
        const [variant] = await db
          .select()
          .from(productVariants)
          .where(eq(productVariants.id, item.variantId))
          .limit(1);

        if (!variant) {
          throw new NotFoundError(`Product variant with ID ${item.variantId}`);
        }

        unitPrice = variant.price;
        variantName = variant.name;
        sku = variant.sku || undefined;
      }

      const itemSubtotal = unitPrice * item.quantity;
      subtotal += itemSubtotal;

      processedItems.push({
        productId: item.productId,
        variantId: item.variantId,
        productName: product.name,
        variantName,
        sku,
        unitPrice,
        quantity: item.quantity,
        subtotal: itemSubtotal,
        productSnapshot: {
          name: product.name,
          description: product.description,
          basePrice: product.basePrice,
        },
      });
    }

    // Calculate shipping (flat rate for now)
    const shippingCost = subtotal >= 100000 ? 0 : 5000; // Free shipping over 1000 THB

    // Calculate tax (7% VAT)
    const taxAmount = Math.round((subtotal + shippingCost) * 0.07);

    // Discount amount (to be implemented with discount codes)
    const discountAmount = 0;

    // Calculate total
    const totalAmount = subtotal + shippingCost + taxAmount - discountAmount;

    return {
      subtotal,
      shippingCost,
      taxAmount,
      discountAmount,
      totalAmount,
      items: processedItems,
    };
  }

  /**
   * Create a new order
   */
  async createOrder(data: CreateOrderRequest) {
    // Validate addresses
    this.validateAddress(data.shippingAddress);
    this.validateAddress(data.billingAddress);

    // Validate stock availability
    await this.validateStockAvailability(data.items as Array<{ productId: string; variantId?: string; quantity: number }>);

    // Calculate pricing
    const orderData = await this.calculateOrderPricing(data.items as Array<{ productId: string; variantId?: string; quantity: number }>);

    // Generate order number
    const orderNumber = this.generateOrderNumber();

    // Create order with transaction
    const order = await ordersRepository.createOrder(data, {
      orderNumber,
      ...orderData,
    });

    return order;
  }

  /**
   * Get all orders with pagination and filtering
   */
  async getOrders(params: GetOrdersParams) {
    const result = await ordersRepository.getOrders(params);
    return {
      data: result.orders,
      total: result.total,
      page: params.page,
      limit: params.limit,
    };
  }

  /**
   * Get order by ID
   */
  async getOrderById(id: string) {
    return await ordersRepository.getOrderById(id);
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    id: string,
    data: UpdateOrderStatusRequest,
    changedBy?: string
  ) {
    // Validate status transition (basic validation)
    const validStatuses = [
      'pending',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
      'refunded',
    ];

    if (!validStatuses.includes(data.status)) {
      throw new ValidationError(`Invalid status: ${data.status}`);
    }

    return await ordersRepository.updateOrderStatus(
      id,
      data.status,
      data.note,
      changedBy
    );
  }

  /**
   * Get order status history
   */
  async getOrderStatusHistory(orderId: string) {
    return await ordersRepository.getOrderStatusHistory(orderId);
  }
}

export const ordersDomain = new OrdersDomain();
