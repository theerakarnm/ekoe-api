import { pgTable, serial, varchar, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { users } from "./auth-schema";
import { uuidv7 } from "uuidv7";

// Customer profiles (extends users table)
export const customerProfiles = pgTable("customer_profiles", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }).unique(),

  // Personal info
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  phone: varchar("phone", { length: 50 }),
  dateOfBirth: timestamp("date_of_birth"),

  // Preferences
  newsletterSubscribed: boolean("newsletter_subscribed").default(false),
  smsSubscribed: boolean("sms_subscribed").default(false),
  language: varchar("language", { length: 10 }).default("th"),

  // Stats
  totalOrders: integer("total_orders").default(0),
  totalSpent: integer("total_spent").default(0), // in cents
  averageOrderValue: integer("average_order_value").default(0),

  // Customer tier
  customerTier: varchar("customer_tier", { length: 50 }).default("regular"), // regular, silver, gold, platinum
  loyaltyPoints: integer("loyalty_points").default(0),

  // Notes
  notes: text("notes"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastOrderAt: timestamp("last_order_at"),
});

// Customer addresses (saved addresses)
export const customerAddresses = pgTable("customer_addresses", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),

  // Address details
  label: varchar("label", { length: 100 }), // "Home", "Office", etc.
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

  // Flags
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Wishlist
export const wishlists = pgTable("wishlists", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 36 }).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Product reviews
export const reviews = pgTable("reviews", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  productId: varchar("product_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  orderId: varchar("order_id", { length: 36 }), // Link to verified purchase

  // Review content
  rating: integer("rating").notNull(), // 1-5
  title: varchar("title", { length: 255 }),
  comment: text("comment"),

  // Reviewer info (if not logged in)
  reviewerName: varchar("reviewer_name", { length: 255 }),
  reviewerEmail: varchar("reviewer_email", { length: 255 }),

  // Status
  status: varchar("status", { length: 50 }).default("pending"), // pending, approved, rejected
  isVerifiedPurchase: boolean("is_verified_purchase").default(false),

  // Helpful votes
  helpfulCount: integer("helpful_count").default(0),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
});

// Review images
export const reviewImages = pgTable("review_images", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  reviewId: varchar("review_id", { length: 36 }).notNull().references(() => reviews.id, { onDelete: "cascade" }),

  imageUrl: varchar("image_url", { length: 1000 }).notNull(),
  sortOrder: integer("sort_order").default(0),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Review helpful votes
export const reviewHelpfulVotes = pgTable("review_helpful_votes", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  reviewId: varchar("review_id", { length: 36 }).notNull().references(() => reviews.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),

  // Track by IP if user not logged in
  ipAddress: varchar("ip_address", { length: 45 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
