import { pgTable, varchar, text, integer, timestamp, boolean, jsonb, decimal, date, index, pgEnum } from "drizzle-orm/pg-core";
import { users } from "./auth-schema";
import { orders, orderItems } from "./orders.schema";
import { uuidv7 } from "uuidv7";

// Enums for audit system
export const auditEventTypeEnum = pgEnum('audit_event_type', [
  'promotion_created',
  'promotion_updated', 
  'promotion_deleted',
  'promotion_activated',
  'promotion_deactivated',
  'promotion_paused',
  'promotion_resumed',
  'promotion_applied',
  'promotion_usage_recorded',
  'rule_created',
  'rule_updated',
  'rule_deleted',
  'security_violation',
  'suspicious_activity',
  'high_value_promotion_applied',
  'usage_limit_exceeded',
  'calculation_validation_failed'
]);

export const auditSeverityEnum = pgEnum('audit_severity', [
  'info',
  'warning', 
  'error',
  'critical'
]);

export const auditEntityTypeEnum = pgEnum('audit_entity_type', [
  'promotion',
  'promotion_rule',
  'promotion_usage',
  'security_event'
]);

// Main promotions table for the promotional system
export const autoPromotions = pgTable("auto_promotions", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  
  // Basic information
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  
  // Promotion type
  type: varchar("type", { length: 50 }).notNull(), // 'percentage_discount', 'fixed_discount', 'free_gift'
  
  // Status management
  status: varchar("status", { length: 50 }).notNull().default("draft"), // 'draft', 'scheduled', 'active', 'paused', 'expired'
  priority: integer("priority").notNull().default(0),
  
  // Scheduling
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  
  // Usage limits
  usageLimit: integer("usage_limit"), // total times promotion can be used
  usageLimitPerCustomer: integer("usage_limit_per_customer").default(1),
  currentUsageCount: integer("current_usage_count").default(0),
  
  // Exclusivity rules
  exclusiveWith: jsonb("exclusive_with"), // Array of promotion IDs that cannot be combined
  
  // Metadata
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // Soft delete
}, (table) => ({
  // Indexes for optimal query performance
  statusIdx: index("auto_promotions_status_idx").on(table.status),
  activePromotionsIdx: index("auto_promotions_active_idx").on(table.status, table.startsAt, table.endsAt),
  priorityIdx: index("auto_promotions_priority_idx").on(table.priority),
  typeIdx: index("auto_promotions_type_idx").on(table.type),
}));

// Promotion rules table for conditions and benefits
export const autoPromotionRules = pgTable("auto_promotion_rules", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  promotionId: varchar("promotion_id", { length: 36 }).notNull().references(() => autoPromotions.id, { onDelete: "cascade" }),
  
  // Rule configuration
  ruleType: varchar("rule_type", { length: 50 }).notNull(), // 'condition' or 'benefit'
  
  // Condition configuration (when ruleType = 'condition')
  conditionType: varchar("condition_type", { length: 50 }), // 'cart_value', 'product_quantity', 'specific_products', 'category_products'
  operator: varchar("operator", { length: 10 }), // 'gte', 'lte', 'eq', 'in', 'not_in'
  
  // Values for conditions
  numericValue: decimal("numeric_value", { precision: 10, scale: 2 }),
  textValue: varchar("text_value", { length: 500 }),
  jsonValue: jsonb("json_value"), // For complex conditions like product arrays
  
  // Benefit configuration (when ruleType = 'benefit')
  benefitType: varchar("benefit_type", { length: 50 }), // 'percentage_discount', 'fixed_discount', 'free_gift'
  benefitValue: decimal("benefit_value", { precision: 10, scale: 2 }),
  maxDiscountAmount: integer("max_discount_amount"), // in cents, for percentage discount caps
  
  // Product/category targeting
  applicableProductIds: jsonb("applicable_product_ids"), // Array of product IDs
  applicableCategoryIds: jsonb("applicable_category_ids"), // Array of category IDs
  giftProductIds: jsonb("gift_product_ids"), // Array of gift product IDs
  giftQuantities: jsonb("gift_quantities"), // Array of quantities for each gift
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Indexes for rule queries
  promotionRuleTypeIdx: index("auto_promotion_rules_promotion_type_idx").on(table.promotionId, table.ruleType),
  conditionTypeIdx: index("auto_promotion_rules_condition_type_idx").on(table.conditionType),
  benefitTypeIdx: index("auto_promotion_rules_benefit_type_idx").on(table.benefitType),
}));

// Promotion usage tracking
export const autoPromotionUsage = pgTable("auto_promotion_usage", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  promotionId: varchar("promotion_id", { length: 36 }).notNull().references(() => autoPromotions.id, { onDelete: "cascade" }),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  
  // Applied benefits
  discountAmount: integer("discount_amount").notNull().default(0), // in cents
  freeGifts: jsonb("free_gifts"), // Array of gift items awarded
  
  // Context at time of application
  cartSubtotal: integer("cart_subtotal").notNull(), // in cents at time of application
  promotionSnapshot: jsonb("promotion_snapshot"), // Full promotion details at time of use
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Indexes for usage tracking and analytics
  promotionUsageIdx: index("auto_promotion_usage_promotion_idx").on(table.promotionId),
  customerUsageIdx: index("auto_promotion_usage_customer_idx").on(table.customerId, table.promotionId),
  orderUsageIdx: index("auto_promotion_usage_order_idx").on(table.orderId),
  dateUsageIdx: index("auto_promotion_usage_date_idx").on(table.createdAt),
}));

// Promotion analytics for performance tracking
export const autoPromotionAnalytics = pgTable("auto_promotion_analytics", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  promotionId: varchar("promotion_id", { length: 36 }).notNull().references(() => autoPromotions.id, { onDelete: "cascade" }),
  
  // Time period for analytics
  date: date("date").notNull(),
  hour: integer("hour"), // 0-23 for hourly analytics, null for daily
  
  // Metrics
  views: integer("views").default(0), // Times promotion was shown/evaluated
  applications: integer("applications").default(0), // Times promotion was applied
  totalDiscountAmount: integer("total_discount_amount").default(0), // in cents
  totalOrders: integer("total_orders").default(0),
  totalRevenue: integer("total_revenue").default(0), // in cents
  
  // Calculated fields
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 4 }), // applications / views
  averageOrderValue: integer("average_order_value"), // in cents
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint and indexes for analytics
  uniqueAnalytics: index("auto_promotion_analytics_unique_idx").on(table.promotionId, table.date, table.hour),
  dateAnalyticsIdx: index("auto_promotion_analytics_date_idx").on(table.date),
  promotionAnalyticsIdx: index("auto_promotion_analytics_promotion_idx").on(table.promotionId),
}));

// Promotion audit logs for security and compliance
export const autoPromotionAuditLogs = pgTable("auto_promotion_audit_logs", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),
  
  // Event information
  eventType: auditEventTypeEnum("event_type").notNull(),
  promotionId: varchar("promotion_id", { length: 36 }).references(() => autoPromotions.id, { onDelete: "set null" }),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  customerId: varchar("customer_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  
  // Entity information
  entityType: auditEntityTypeEnum("entity_type").notNull(),
  entityId: varchar("entity_id", { length: 36 }),
  
  // Change tracking
  oldValues: jsonb("old_values"), // Previous values before change
  newValues: jsonb("new_values"), // New values after change
  metadata: jsonb("metadata"), // Additional context and information
  
  // Request context
  ipAddress: varchar("ip_address", { length: 45 }), // IPv4 or IPv6
  userAgent: text("user_agent"),
  sessionId: varchar("session_id", { length: 128 }),
  
  // Audit metadata
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  severity: auditSeverityEnum("severity").notNull().default('info'),
}, (table) => ({
  // Indexes for audit log queries
  eventTypeIdx: index("auto_promotion_audit_logs_event_type_idx").on(table.eventType),
  promotionAuditIdx: index("auto_promotion_audit_logs_promotion_idx").on(table.promotionId),
  userAuditIdx: index("auto_promotion_audit_logs_user_idx").on(table.userId),
  customerAuditIdx: index("auto_promotion_audit_logs_customer_idx").on(table.customerId),
  timestampIdx: index("auto_promotion_audit_logs_timestamp_idx").on(table.timestamp),
  severityIdx: index("auto_promotion_audit_logs_severity_idx").on(table.severity),
  entityTypeIdx: index("auto_promotion_audit_logs_entity_type_idx").on(table.entityType),
  entityAuditIdx: index("auto_promotion_audit_logs_entity_idx").on(table.entityType, table.entityId),
}));