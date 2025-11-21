import { pgTable, serial, varchar, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { users } from "./users.schema";

// Discount codes / Coupons
export const discountCodes = pgTable("discount_codes", {
  id: serial("id").primaryKey(),
  
  // Code details
  code: varchar("code", { length: 100 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  
  // Discount type
  discountType: varchar("discount_type", { length: 50 }).notNull(), // percentage, fixed_amount, free_shipping
  discountValue: integer("discount_value").notNull(), // percentage (e.g., 10 for 10%) or amount in cents
  
  // Conditions
  minPurchaseAmount: integer("min_purchase_amount"), // in cents
  maxDiscountAmount: integer("max_discount_amount"), // cap for percentage discounts
  
  // Usage limits
  usageLimit: integer("usage_limit"), // total times code can be used
  usageLimitPerCustomer: integer("usage_limit_per_customer").default(1),
  currentUsageCount: integer("current_usage_count").default(0),
  
  // Applicability
  applicableToProducts: jsonb("applicable_to_products"), // array of product IDs
  applicableToCategories: jsonb("applicable_to_categories"), // array of category IDs
  
  // Status
  isActive: boolean("is_active").default(true),
  
  // Validity period
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Discount code usage tracking
export const discountCodeUsage = pgTable("discount_code_usage", {
  id: serial("id").primaryKey(),
  discountCodeId: integer("discount_code_id").notNull().references(() => discountCodes.id, { onDelete: "cascade" }),
  orderId: integer("order_id").notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  
  discountAmount: integer("discount_amount").notNull(), // actual discount applied in cents
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Blog posts
export const blogPosts = pgTable("blog_posts", {
  id: serial("id").primaryKey(),
  
  title: varchar("title", { length: 500 }).notNull(),
  slug: varchar("slug", { length: 500 }).notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content"),
  
  // Featured image
  featuredImageUrl: varchar("featured_image_url", { length: 1000 }),
  featuredImageAlt: varchar("featured_image_alt", { length: 255 }),
  
  // Author
  authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
  authorName: varchar("author_name", { length: 255 }),
  
  // Category
  categoryId: integer("category_id"),
  categoryName: varchar("category_name", { length: 100 }),
  
  // SEO
  metaTitle: varchar("meta_title", { length: 255 }),
  metaDescription: text("meta_description"),
  
  // Status
  status: varchar("status", { length: 50 }).default("draft"), // draft, published, archived
  
  // Stats
  viewCount: integer("view_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
  deletedAt: timestamp("deleted_at"),
});

// Blog categories
export const blogCategories = pgTable("blog_categories", {
  id: serial("id").primaryKey(),
  
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Newsletter subscribers
export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: serial("id").primaryKey(),
  
  email: varchar("email", { length: 255 }).notNull().unique(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  
  // Status
  status: varchar("status", { length: 50 }).default("active"), // active, unsubscribed, bounced
  
  // Source
  source: varchar("source", { length: 100 }), // checkout, footer, popup
  
  // Preferences
  preferences: jsonb("preferences"),
  
  subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"),
});

// Email campaigns
export const emailCampaigns = pgTable("email_campaigns", {
  id: serial("id").primaryKey(),
  
  name: varchar("name", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  previewText: varchar("preview_text", { length: 500 }),
  
  // Content
  htmlContent: text("html_content"),
  textContent: text("text_content"),
  
  // Targeting
  targetAudience: varchar("target_audience", { length: 100 }), // all, customers, subscribers
  segmentFilters: jsonb("segment_filters"),
  
  // Status
  status: varchar("status", { length: 50 }).default("draft"), // draft, scheduled, sending, sent
  
  // Stats
  recipientCount: integer("recipient_count").default(0),
  sentCount: integer("sent_count").default(0),
  openCount: integer("open_count").default(0),
  clickCount: integer("click_count").default(0),
  
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Promotions / Banners
export const promotions = pgTable("promotions", {
  id: serial("id").primaryKey(),
  
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Display
  bannerImageUrl: varchar("banner_image_url", { length: 1000 }),
  bannerImageMobileUrl: varchar("banner_image_mobile_url", { length: 1000 }),
  linkUrl: varchar("link_url", { length: 1000 }),
  
  // Placement
  placement: varchar("placement", { length: 100 }), // homepage_hero, homepage_banner, product_page
  sortOrder: integer("sort_order").default(0),
  
  // Status
  isActive: boolean("is_active").default(true),
  
  // Validity
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
