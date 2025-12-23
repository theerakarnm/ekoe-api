import { pgTable, varchar, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

// Contact status enum
export const contactStatusEnum = pgEnum("contact_status", ["unread", "read", "responded"]);

// Contact submissions table
export const contacts = pgTable("contacts", {
  id: varchar('id', { length: 36 }).$defaultFn(uuidv7).primaryKey(),

  // Contact info
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  topic: varchar("topic", { length: 255 }).notNull(),
  message: text("message").notNull(),

  // Status tracking
  status: contactStatusEnum("status").default("unread").notNull(),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
});

// Type exports
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
