import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { ExtractTablesWithRelations } from 'drizzle-orm';
import { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import { PgTransaction } from 'drizzle-orm/pg-core';
import * as schema from './schema'
import { autoPromotions, autoPromotionRules, autoPromotionUsage, autoPromotionAnalytics } from './schema'

export const commonColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
};

export type PgTx = PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>

// Promotional system types
export type AutoPromotion = typeof autoPromotions.$inferSelect;
export type NewAutoPromotion = typeof autoPromotions.$inferInsert;
export type AutoPromotionRule = typeof autoPromotionRules.$inferSelect;
export type NewAutoPromotionRule = typeof autoPromotionRules.$inferInsert;
export type AutoPromotionUsage = typeof autoPromotionUsage.$inferSelect;
export type NewAutoPromotionUsage = typeof autoPromotionUsage.$inferInsert;
export type AutoPromotionAnalytics = typeof autoPromotionAnalytics.$inferSelect;
export type NewAutoPromotionAnalytics = typeof autoPromotionAnalytics.$inferInsert;
