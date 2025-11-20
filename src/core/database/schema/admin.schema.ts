import { pgTable, serial, varchar, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { users } from "./users.schema";

// Admin roles
export const adminRoles = pgTable("admin_roles", {
  id: serial("id").primaryKey(),
  
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
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  roleId: integer("role_id").notNull().references(() => adminRoles.id, { onDelete: "restrict" }),
  
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Activity logs
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  
  // Action details
  action: varchar("action", { length: 100 }).notNull(), // create, update, delete
  entity: varchar("entity", { length: 100 }).notNull(), // product, order, user
  entityId: integer("entity_id"),
  
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
  id: serial("id").primaryKey(),
  
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value"),
  description: text("description"),
  
  // Type hint for frontend
  valueType: varchar("value_type", { length: 50 }).default("string"), // string, number, boolean, json
  
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
});
