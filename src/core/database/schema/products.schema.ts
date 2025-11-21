import { pgTable, serial, varchar, text, integer, decimal, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

// Products table - Core product information
export const products = pgTable("products", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  subtitle: varchar("subtitle", { length: 500 }),
  description: text("description"),
  shortDescription: text("short_description"),

  // Pricing
  basePrice: integer("base_price").notNull(), // in cents
  compareAtPrice: integer("compare_at_price"), // for showing discounts

  // Product type
  productType: varchar("product_type", { length: 50 }).notNull().default("single"), // single, set, bundle

  // Status
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft, active, archived
  featured: boolean("featured").default(false),

  // SEO
  metaTitle: varchar("meta_title", { length: 255 }),
  metaDescription: text("meta_description"),

  // Stats
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0"),
  reviewCount: integer("review_count").default(0),
  viewCount: integer("view_count").default(0),
  soldCount: integer("sold_count").default(0),

  // Inventory
  trackInventory: boolean("track_inventory").default(true),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  publishedAt: timestamp("published_at"),
  deletedAt: timestamp("deleted_at"),
});

// Product variants (sizes, colors, etc.)
export const productVariants = pgTable("product_variants", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),

  // Variant details
  sku: varchar("sku", { length: 100 }).unique(),
  name: varchar("name", { length: 255 }).notNull(), // e.g., "100ml", "200ml"
  value: varchar("value", { length: 100 }).notNull(), // e.g., "100ml", "200ml"

  // Pricing
  price: integer("price").notNull(), // in cents
  compareAtPrice: integer("compare_at_price"),

  // Inventory
  stockQuantity: integer("stock_quantity").default(0),
  lowStockThreshold: integer("low_stock_threshold").default(10),

  // Status
  isActive: boolean("is_active").default(true),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Product images
export const productImages = pgTable("product_images", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),

  url: varchar("url", { length: 1000 }).notNull(),
  altText: varchar("alt_text", { length: 255 }),
  description: text("description"),

  // Association with variant (optional)
  variantId: varchar("variant_id", { length: 36 }).references(() => productVariants.id, { onDelete: "set null" }),

  // Ordering
  sortOrder: integer("sort_order").default(0),
  isPrimary: boolean("is_primary").default(false),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Product tags (Vegan, Cruelty Free, etc.)
export const tags = pgTable("tags", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  description: text("description"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Product-Tag relationship
export const productTags = pgTable("product_tags", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  tagId: varchar("tag_id", { length: 36 }).notNull().references(() => tags.id, { onDelete: "cascade" }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Product categories
export const categories = pgTable("categories", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),

  // Hierarchy
  parentId: varchar("parent_id", { length: 36 }),

  // Display
  imageUrl: varchar("image_url", { length: 1000 }),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),

  // SEO
  metaTitle: varchar("meta_title", { length: 255 }),
  metaDescription: text("meta_description"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Product-Category relationship
export const productCategories = pgTable("product_categories", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  categoryId: varchar("category_id", { length: 36 }).notNull().references(() => categories.id, { onDelete: "cascade" }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Product ingredients
export const ingredients = pgTable("ingredients", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  benefits: text("benefits"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Product-Ingredient relationship
export const productIngredients = pgTable("product_ingredients", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  ingredientId: varchar("ingredient_id", { length: 36 }).notNull().references(() => ingredients.id, { onDelete: "cascade" }),

  isKeyIngredient: boolean("is_key_ingredient").default(false),
  sortOrder: integer("sort_order").default(0),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Product benefits
export const productBenefits = pgTable("product_benefits", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),

  benefit: varchar("benefit", { length: 500 }).notNull(),
  sortOrder: integer("sort_order").default(0),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// How to use instructions
export const productInstructions = pgTable("product_instructions", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),

  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  icon: varchar("icon", { length: 50 }),
  sortOrder: integer("sort_order").default(0),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Product sets (bundles)
export const productSets = pgTable("product_sets", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  setProductId: varchar("set_product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  includedProductId: varchar("included_product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),

  quantity: integer("quantity").default(1),
  sortOrder: integer("sort_order").default(0),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Complimentary gifts
export const complimentaryGifts = pgTable("complimentary_gifts", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  imageUrl: varchar("image_url", { length: 1000 }),
  value: integer("value"), // in cents

  // Conditions
  minPurchaseAmount: integer("min_purchase_amount"), // in cents

  isActive: boolean("is_active").default(true),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Product-Gift relationship
export const productGifts = pgTable("product_gifts", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  productId: varchar("product_id", { length: 36 }).notNull().references(() => products.id, { onDelete: "cascade" }),
  giftId: varchar("gift_id", { length: 36 }).notNull().references(() => complimentaryGifts.id, { onDelete: "cascade" }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
