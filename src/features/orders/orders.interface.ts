import { z } from 'zod';
import type { OrderStatus, FulfillmentStatus, PaymentStatus } from './order-status-state-machine';

// Address schema
export const addressSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  company: z.string().optional(),
  addressLine1: z.string().min(1, 'Address line 1 is required'),
  addressLine2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  province: z.string().min(1, 'Province is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
  country: z.string().default('Thailand'),
  phone: z.string().min(1, 'Phone is required'),
});

// Order item schema
export const orderItemSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  variantId: z.string().optional(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
});

// Create order request schema
export const createOrderSchema = z.object({
  email: z.string().email('Valid email is required'),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  shippingAddress: addressSchema,
  billingAddress: addressSchema,
  customerNote: z.string().optional(),
  discountCode: z.string().optional(),
  shippingMethod: z.string().optional().default('standard'),
  userId: z.string().optional(), // For tracking discount usage per customer
  appliedPromotions: z.array(z.object({
    promotionId: z.string(),
    promotionName: z.string(),
    discountAmount: z.number(),
    freeGifts: z.array(z.object({
      productId: z.string().optional(),
      variantId: z.string().optional(),
      quantity: z.number(),
      name: z.string(),
      imageUrl: z.string().optional(),
      value: z.number(),
    })),
  })).optional(),
});

// Update order status schema
export const updateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
  note: z.string().optional(),
});

// Types
export type Address = z.infer<typeof addressSchema>;
export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type CreateOrderRequest = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusRequest = z.infer<typeof updateOrderStatusSchema>;

// Response types
export interface OrderItemDetail {
  id: string;
  orderId: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  productSnapshot: any;
  isPromotionalGift: boolean | null;
  sourcePromotionId: string | null;
  promotionDiscountAmount: number | null;
  createdAt: Date;
}

export interface ShippingAddress {
  id: string;
  orderId: string;
  firstName: string;
  lastName: string;
  company: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  phone: string;
  createdAt: Date;
}

export interface BillingAddress {
  id: string;
  orderId: string;
  firstName: string;
  lastName: string;
  company: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  phone: string | null;
  createdAt: Date;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string | null;
  email: string;
  invoiceNo: string | null;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string | null;
  subtotal: number;
  shippingCost: number | null;
  taxAmount: number | null;
  discountAmount: number | null;
  totalAmount: number;
  currency: string | null;
  customerNote: string | null;
  internalNote: string | null;
  appliedPromotions: any | null; // JSON field for promotion details
  promotionDiscountAmount: number | null;
  createdAt: Date;
  updatedAt: Date;
  paidAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
}

export interface OrderDetail extends Order {
  items: OrderItemDetail[];
  shippingAddress: ShippingAddress | null;
  billingAddress: BillingAddress | null;
  statusHistory?: OrderStatusHistory[];
}

export interface OrderStatusHistory {
  id: string;
  orderId: string;
  status: string;
  note: string | null;
  changedBy: string | null;
  changedByName?: string;
  createdAt: Date;
}

export interface GetOrdersParams {
  page: number;
  limit: number;
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Payment event types
export type PaymentEventType = 'payment_completed' | 'payment_failed' | 'refund_processed';

export interface PaymentEvent {
  type: PaymentEventType;
  orderId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Status update result
export interface OrderStatusUpdate {
  orderId: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  timestamp: Date;
  changedBy?: string;
}
