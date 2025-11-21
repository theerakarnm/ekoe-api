import { pgTable, serial, varchar, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { users } from "./auth-schema";
import { uuidv7 } from "uuidv7";

// Admin roles
export const adminRoles = pgTable("admin_roles", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),

  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),

  // Permissions (could be expanded to separate table)
  permissions: text("permissions").array(), // ['products.read', 'products.write', 'orders.read', etc.]

  isActive: boolean("is_active").default(true),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Admin users
export const adminUsers = pgTable("admin_users", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  roleId: varchar("role_id", { length: 36 }).notNull().references(() => adminRoles.id, { onDelete: "restrict" }),

  isActive: boolean("is_active").default(true),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Activity logs
export const activityLogs = pgTable("activity_logs", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),

  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),

  // Action details
  action: varchar("action", { length: 100 }).notNull(), // create, update, delete
  entity: varchar("entity", { length: 100 }).notNull(), // product, order, user
  entityId: varchar("entity_id", { length: 36 }),

  // Changes
  description: text("description"),
  oldValues: text("old_values"),
  newValues: text("new_values"),

  // Request info
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// System settings
export const systemSettings = pgTable("system_settings", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),

  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value"),
  description: text("description"),

  // Type hint for frontend
  valueType: varchar("value_type", { length: 50 }).default("string"), // string, number, boolean, json

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: varchar("updated_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
});
