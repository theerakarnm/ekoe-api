import { pgTable, varchar, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

// Marketing Campaigns - Promotional landing pages
export const marketingCampaigns = pgTable("marketing_campaigns", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),

  // Basic info
  name: varchar("name", { length: 255 }).notNull(), // Internal name for admin
  slug: varchar("slug", { length: 255 }).notNull().unique(), // URL-friendly identifier

  // Content
  title: varchar("title", { length: 500 }).notNull(),
  subtitle: varchar("subtitle", { length: 500 }),
  description: text("description"),

  // Media
  heroImageUrl: varchar("hero_image_url", { length: 1000 }),
  heroImageMobileUrl: varchar("hero_image_mobile_url", { length: 1000 }),
  logoUrl: varchar("logo_url", { length: 1000 }), // Optional brand logo

  // Additional content blocks (for flexible content structure)
  contentBlocks: jsonb("content_blocks"), // Array of content sections

  // Button/CTA
  ctaText: varchar("cta_text", { length: 100 }),
  ctaUrl: varchar("cta_url", { length: 1000 }),

  // Status & Scheduling
  isActive: boolean("is_active").default(true),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

// Campaign Registrations - Phone number submissions
export const campaignRegistrations = pgTable("campaign_registrations", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),

  // Reference to campaign
  campaignId: varchar("campaign_id", { length: 36 }).notNull().references(() => marketingCampaigns.id, { onDelete: "cascade" }),

  // Contact info
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
