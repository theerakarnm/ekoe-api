import { ordersRepository } from './orders.repository';
import { db } from '../../core/database';
import { products, productVariants } from '../../core/database/schema/products.schema';
import { eq, and, isNull } from 'drizzle-orm';
import { ValidationError, NotFoundError } from '../../core/errors';
import { orderStatusStateMachine, type OrderStatus } from './order-status-state-machine';
import { emailService } from '../../core/email';
import { config } from '../../core/config';
import { logger } from '../../core/logger';
import { cartDomain } from '../cart/cart.domain';
import { cartRepository } from '../cart/cart.repository';
import { calculateShippingCost, isValidShippingMethod } from '../../core/config/shipping.config';
import type {
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  GetOrdersParams,
  PaymentEvent,
  OrderStatusUpdate,
  OrderDetail,
} from './orders.interface';
import type { FreeGift } from '../cart/cart.interface';

export class OrdersDomain {
  private stateMachine = orderStatusStateMachine;

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
   * Calculate order pricing with discount and shipping method support
   */
  private async calculateOrderPricing(
    items: Array<{ productId: string; variantId?: string; quantity: number }>,
    discountCode?: string,
    shippingMethod?: string,
    userId?: string
  ): Promise<{
    subtotal: number;
    shippingCost: number;
    taxAmount: number;
    discountAmount: number;
    totalAmount: number;
    discountCodeId?: string;
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

    // Apply discount code if provided
    let discountAmount = 0;
    let discountCodeId: string | undefined;
    let hasFreeShippingDiscount = false;

    if (discountCode) {
      const discountValidation = await cartDomain.validateDiscountCode(
        discountCode,
        subtotal,
        items,
        userId
      );

      if (!discountValidation.isValid) {
        throw new ValidationError(
          discountValidation.error || 'Invalid discount code',
          { errorCode: discountValidation.errorCode }
        );
      }

      // Get discount code details for tracking
      const dbDiscountCode = await cartRepository.getDiscountCodeByCode(discountCode);
      if (dbDiscountCode) {
        discountCodeId = dbDiscountCode.id;
        hasFreeShippingDiscount = dbDiscountCode.discountType === 'free_shipping';
        
        // Calculate discount amount (will be adjusted for free shipping later)
        if (discountValidation.discountAmount) {
          discountAmount = discountValidation.discountAmount;
        }
      }
    }

    // Calculate shipping cost based on selected method
    const method = shippingMethod || 'standard';
    
    // Validate shipping method
    if (!isValidShippingMethod(method)) {
      throw new ValidationError(`Invalid shipping method: ${method}`);
    }

    // Calculate shipping cost (considering free shipping discount and threshold)
    let shippingCost = 0;
    if (hasFreeShippingDiscount) {
      // Free shipping from discount code
      shippingCost = 0;
      // Set discount amount to what shipping would have cost
      const regularShippingCost = subtotal >= 100000 ? 0 : calculateShippingCost(method);
      discountAmount = regularShippingCost;
    } else if (subtotal >= 100000) {
      // Free shipping over 1000 THB (100000 cents)
      shippingCost = 0;
    } else {
      shippingCost = calculateShippingCost(method);
    }

    // Calculate tax (7% VAT)
    const taxAmount = Math.round((subtotal + shippingCost) * 0.07);

    // Calculate total
    const totalAmount = subtotal + shippingCost + taxAmount - discountAmount;

    return {
      subtotal,
      shippingCost,
      taxAmount,
      discountAmount,
      totalAmount,
      discountCodeId,
      items: processedItems,
    };
  }

  /**
   * Create a new order with discount and shipping method support
   */
  async createOrder(data: CreateOrderRequest, userId?: string) {
    // Validate addresses
    this.validateAddress(data.shippingAddress);
    this.validateAddress(data.billingAddress);

    // Validate stock availability
    await this.validateStockAvailability(data.items as Array<{ productId: string; variantId?: string; quantity: number }>);

    // Calculate pricing with discount and shipping method
    const orderData = await this.calculateOrderPricing(
      data.items as Array<{ productId: string; variantId?: string; quantity: number }>,
      data.discountCode,
      data.shippingMethod,
      userId
    );

    // Generate order number
    const orderNumber = this.generateOrderNumber();

    // Get eligible free gifts
    const productIds = data.items.map(item => item.productId);
    const eligibleGifts = await cartRepository.getEligibleGifts(orderData.subtotal, productIds);

    // Create order with transaction
    const order = await ordersRepository.createOrder(data, {
      orderNumber,
      ...orderData,
      eligibleGifts,
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
   * Send status notification email asynchronously
   */
  private async sendStatusNotification(
    order: OrderDetail,
    newStatus: OrderStatus,
    note?: string
  ): Promise<void> {
    // Don't block on email sending - run asynchronously
    setImmediate(async () => {
      try {
        const orderDetailsUrl = `${config.web.url}/order-success/${order.orderNumber}`;
        const orderDate = order.createdAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        switch (newStatus) {
          case 'processing':
            await emailService.sendOrderProcessingEmail(
              order.email,
              order.orderNumber,
              orderDate,
              orderDetailsUrl
            );
            break;

          case 'shipped':
            // For shipped status, we need tracking information
            // Using placeholder values - these should come from shipping integration
            const trackingNumber = 'TRK' + Date.now().toString().slice(-10);
            const carrier = 'Thailand Post';
            const estimatedDelivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
            const trackingUrl = `https://track.thailandpost.co.th/?trackNumber=${trackingNumber}`;

            await emailService.sendOrderShippedEmail(
              order.email,
              order.orderNumber,
              trackingNumber,
              carrier,
              estimatedDelivery,
              trackingUrl,
              orderDetailsUrl
            );
            break;

          case 'delivered':
            const deliveryDate = new Date().toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
            const deliveryAddress = order.shippingAddress
              ? `${order.shippingAddress.addressLine1}, ${order.shippingAddress.city}, ${order.shippingAddress.province} ${order.shippingAddress.postalCode}`
              : 'N/A';

            await emailService.sendOrderDeliveredEmail(
              order.email,
              order.orderNumber,
              deliveryDate,
              deliveryAddress,
              orderDetailsUrl
            );
            break;

          case 'cancelled':
            const cancellationReason = note || 'Order cancelled as requested';

            await emailService.sendOrderCancelledEmail(
              order.email,
              order.orderNumber,
              cancellationReason,
              orderDetailsUrl
            );
            break;

          case 'refunded':
            const refundReason = note || 'Refund processed';
            const refundAmount = order.totalAmount;
            const currency = order.currency || 'THB';

            await emailService.sendOrderRefundedEmail(
              order.email,
              order.orderNumber,
              refundAmount,
              currency,
              refundReason,
              orderDetailsUrl
            );
            break;
        }

        logger.info(
          { orderId: order.id, orderNumber: order.orderNumber, status: newStatus },
          'Status notification email sent'
        );
      } catch (error) {
        // Log error but don't throw - email failures shouldn't block status updates
        logger.error(
          { error, orderId: order.id, orderNumber: order.orderNumber, status: newStatus },
          'Failed to send status notification email'
        );
      }
    });
  }

  /**
   * Update order status with state machine validation
   */
  async updateOrderStatus(
    id: string,
    data: UpdateOrderStatusRequest,
    changedBy?: string
  ): Promise<OrderStatusUpdate> {
    // Get current order
    const order = await ordersRepository.getOrderById(id);
    
    const currentStatus = order.status as OrderStatus;
    const newStatus = data.status as OrderStatus;

    // Validate transition using state machine
    if (!this.stateMachine.isValidTransition(currentStatus, newStatus)) {
      const reason = this.stateMachine.getTransitionReason(currentStatus, newStatus);
      throw new ValidationError(
        reason || `Invalid status transition from ${currentStatus} to ${newStatus}`,
        { from: currentStatus, to: newStatus }
      );
    }

    // Update order status
    await ordersRepository.updateOrderStatus(
      id,
      newStatus,
      data.note,
      changedBy
    );

    // Send email notification asynchronously (don't block on this)
    this.sendStatusNotification(order, newStatus, data.note);

    return {
      orderId: id,
      previousStatus: currentStatus,
      newStatus: newStatus,
      timestamp: new Date(),
      changedBy,
    };
  }

  /**
   * Get valid next statuses for an order
   */
  async getValidNextStatuses(orderId: string): Promise<OrderStatus[]> {
    const order = await ordersRepository.getOrderById(orderId);
    const currentStatus = order.status as OrderStatus;
    return this.stateMachine.getValidNextStatuses(currentStatus);
  }

  /**
   * Handle payment events and automatically update order status
   */
  async handlePaymentEvent(event: PaymentEvent): Promise<void> {
    const { type, orderId, metadata } = event;

    // Get current order
    const order = await ordersRepository.getOrderById(orderId);
    const currentStatus = order.status as OrderStatus;

    let newStatus: OrderStatus | null = null;
    let note: string | undefined;

    switch (type) {
      case 'payment_completed':
        // Transition from pending to processing when payment completes
        if (currentStatus === 'pending') {
          newStatus = 'processing';
          note = 'Payment completed successfully';
        }
        break;

      case 'payment_failed':
        // Keep order in pending status, just record the failure
        note = `Payment failed: ${metadata?.reason || 'Unknown reason'}`;
        // Create history entry without changing status
        // Use undefined for system changes (no user ID)
        await ordersRepository.createStatusHistoryEntry(
          orderId,
          currentStatus,
          note,
          undefined
        );
        return;

      case 'refund_processed':
        // Transition to refunded status
        if (this.stateMachine.isValidTransition(currentStatus, 'refunded')) {
          newStatus = 'refunded';
          note = 'Refund processed successfully';
        }
        break;
    }

    // Update status if a transition is needed
    if (newStatus && this.stateMachine.isValidTransition(currentStatus, newStatus)) {
      await ordersRepository.updateOrderStatus(
        orderId,
        newStatus,
        note,
        undefined // Automated change (no user ID)
      );

      // Send email notification asynchronously (don't block on this)
      this.sendStatusNotification(order, newStatus, note);
    }
  }

  /**
   * Get order status history
   */
  async getOrderStatusHistory(orderId: string) {
    return await ordersRepository.getOrderStatusHistory(orderId);
  }
}

export const ordersDomain = new OrdersDomain();
