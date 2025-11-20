import { pgTable, serial, varchar, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { users } from "./users.schema";
import { products, productVariants } from "./products.schema";

// Orders table
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: varchar("order_number", { length: 50 }).notNull().unique(),
  
  // Customer info
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  email: varchar("email", { length: 255 }).notNull(),
  
  // Order status
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, processing, shipped, delivered, cancelled, refunded
  paymentStatus: varchar("payment_status", { length: 50 }).notNull().default("pending"), // pending, paid, failed, refunded
  fulfillmentStatus: varchar("fulfillment_status", { length: 50 }).default("unfulfilled"), // unfulfilled, partial, fulfilled
  
  // Pricing
  subtotal: integer("subtotal").notNull(), // in cents
  shippingCost: integer("shipping_cost").default(0),
  taxAmount: integer("tax_amount").default(0),
  discountAmount: integer("discount_amount").default(0),
  totalAmount: integer("total_amount").notNull(),
  
  // Currency
  currency: varchar("currency", { length: 3 }).default("THB"),
  
  // Notes
  customerNote: text("customer_note"),
  internalNote: text("internal_note"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  paidAt: timestamp("paid_at"),
  shippedAt: timestamp("shipped_at"),
  deliveredAt: timestamp("delivered_at"),
  cancelledAt: timestamp("cancelled_at"),
});

// Order items
export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  
  // Product info (snapshot at time of order)
  productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
  variantId: integer("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  
  productName: varchar("product_name", { length: 255 }).notNull(),
  variantName: varchar("variant_name", { length: 255 }),
  sku: varchar("sku", { length: 100 }),
  
  // Pricing (snapshot)
  unitPrice: integer("unit_price").notNull(), // in cents
  quantity: integer("quantity").notNull(),
  subtotal: integer("subtotal").notNull(), // unitPrice * quantity
  
  // Product snapshot
  productSnapshot: jsonb("product_snapshot"), // Store full product details at time of purchase
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Shipping addresses
export const shippingAddresses = pgTable("shipping_addresses", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  company: varchar("company", { length: 255 }),
  
  addressLine1: varchar("address_line1", { length: 500 }).notNull(),
  addressLine2: varchar("address_line2", { length: 500 }),
  city: varchar("city", { length: 100 }).notNull(),
  province: varchar("province", { length: 100 }).notNull(),
  postalCode: varchar("postal_code", { length: 20 }).notNull(),
  country: varchar("country", { length: 100 }).notNull().default("Thailand"),
  
  phone: varchar("phone", { length: 50 }).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Billing addresses
export const billingAddresses = pgTable("billing_addresses", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  company: varchar("company", { length: 255 }),
  
  addressLine1: varchar("address_line1", { length: 500 }).notNull(),
  addressLine2: varchar("address_line2", { length: 500 }),
  city: varchar("city", { length: 100 }).notNull(),
  province: varchar("province", { length: 100 }).notNull(),
  postalCode: varchar("postal_code", { length: 20 }).notNull(),
  country: varchar("country", { length: 100 }).notNull().default("Thailand"),
  
  phone: varchar("phone", { length: 50 }),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Payment transactions
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  
  // Payment details
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(), // credit_card, promptpay, bank_transfer
  paymentProvider: varchar("payment_provider", { length: 100 }), // stripe, omise, etc.
  
  amount: integer("amount").notNull(), // in cents
  currency: varchar("currency", { length: 3 }).default("THB"),
  
  // Transaction info
  transactionId: varchar("transaction_id", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, completed, failed, refunded
  
  // Card info (last 4 digits only)
  cardLast4: varchar("card_last4", { length: 4 }),
  cardBrand: varchar("card_brand", { length: 50 }),
  
  // Response data
  providerResponse: jsonb("provider_response"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  failedAt: timestamp("failed_at"),
});

// Shipments
export const shipments = pgTable("shipments", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  
  // Shipping details
  carrier: varchar("carrier", { length: 100 }), // Kerry, Flash, Thailand Post
  trackingNumber: varchar("tracking_number", { length: 255 }),
  trackingUrl: varchar("tracking_url", { length: 1000 }),
  
  shippingMethod: varchar("shipping_method", { length: 100 }), // standard, express, next_day
  
  // Status
  status: varchar("status", { length: 50 }).default("pending"), // pending, in_transit, delivered, failed
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  shippedAt: timestamp("shipped_at"),
  estimatedDeliveryAt: timestamp("estimated_delivery_at"),
  deliveredAt: timestamp("delivered_at"),
});

// Order status history
export const orderStatusHistory = pgTable("order_status_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  
  status: varchar("status", { length: 50 }).notNull(),
  note: text("note"),
  
  // Who made the change
  changedBy: integer("changed_by").references(() => users.id, { onDelete: "set null" }),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Order gifts (complimentary items)
export const orderGifts = pgTable("order_gifts", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  
  giftName: varchar("gift_name", { length: 255 }).notNull(),
  giftDescription: text("gift_description"),
  giftImageUrl: varchar("gift_image_url", { length: 1000 }),
  giftValue: integer("gift_value"), // in cents
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
