import { pgTable, serial, varchar, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

// Product views tracking
export const productViews = pgTable("product_views", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  productId: varchar("product_id", { length: 36 }).notNull(),

  // Visitor info
  userId: varchar("user_id", { length: 36 }),
  sessionId: varchar("session_id", { length: 255 }),
  ipAddress: varchar("ip_address", { length: 45 }),

  // Device & browser
  userAgent: text("user_agent"),
  deviceType: varchar("device_type", { length: 50 }), // mobile, tablet, desktop

  // Referrer
  referrer: varchar("referrer", { length: 1000 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Cart abandonment tracking
export const abandonedCarts = pgTable("abandoned_carts", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),

  userId: varchar("user_id", { length: 36 }),
  sessionId: varchar("session_id", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),

  // Cart data
  cartData: jsonb("cart_data").notNull(), // snapshot of cart items
  totalValue: integer("total_value").notNull(), // in cents

  // Recovery
  isRecovered: boolean("is_recovered").default(false),
  recoveredOrderId: varchar("recovered_order_id", { length: 36 }),

  // Email sent
  reminderEmailSent: boolean("reminder_email_sent").default(false),
  reminderEmailSentAt: timestamp("reminder_email_sent_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Search queries
export const searchQueries = pgTable("search_queries", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),

  query: varchar("query", { length: 500 }).notNull(),

  // Results
  resultCount: integer("result_count").default(0),

  // User info
  userId: varchar("user_id", { length: 36 }),
  sessionId: varchar("session_id", { length: 255 }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User sessions
export const userSessions = pgTable("user_sessions", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  sessionId: varchar("session_id", { length: 255 }).notNull().unique(),

  userId: varchar("user_id", { length: 36 }),

  // Session data
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  deviceType: varchar("device_type", { length: 50 }),

  // Landing page
  landingPage: varchar("landing_page", { length: 1000 }),
  referrer: varchar("referrer", { length: 1000 }),

  // Session stats
  pageViews: integer("page_views").default(0),
  duration: integer("duration"), // in seconds

  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
});

// Page views
export const pageViews = pgTable("page_views", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),

  sessionId: varchar("session_id", { length: 255 }).notNull(),
  userId: varchar("user_id", { length: 36 }),

  // Page info
  path: varchar("path", { length: 1000 }).notNull(),
  title: varchar("title", { length: 500 }),

  // Referrer
  referrer: varchar("referrer", { length: 1000 }),

  // Time on page
  timeOnPage: integer("time_on_page"), // in seconds

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
