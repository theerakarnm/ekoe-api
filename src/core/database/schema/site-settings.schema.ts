import { pgTable, varchar, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { users } from "./auth-schema";
import { uuidv7 } from "uuidv7";

/**
 * Site Settings table for CMS content
 * Stores key-value pairs with JSONB values for flexible content storage
 * 
 * Keys:
 * - hero_slides: Array of slide objects for hero section carousel
 * - feature_section: Object with leftImage and rightImage URLs
 * - online_executive: Object with mainImage, quoteImage, and quoteText
 * - welcome_popup: Object with image, title, subtitle, description, terms
 */
export const siteSettings = pgTable("site_settings", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),

  // Unique key for the setting
  key: varchar("key", { length: 100 }).notNull().unique(),

  // Setting value as JSONB for flexible structure
  value: jsonb("value").notNull(),

  // Human-readable description of the setting
  description: text("description"),

  // Audit fields
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: varchar("updated_by", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Type definitions for site settings values
export type SiteSettingKey =
  | 'hero_slides'
  | 'feature_section'
  | 'online_executive'
  | 'welcome_popup';
