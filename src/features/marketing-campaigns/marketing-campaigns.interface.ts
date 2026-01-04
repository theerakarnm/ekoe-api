import { z } from 'zod';

// ============================================================
// Create Marketing Campaign Schema
// ============================================================

export const createMarketingCampaignSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  slug: z.string().min(1, 'Slug is required').max(255).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format'),
  title: z.string().min(1, 'Title is required').max(500),
  subtitle: z.string().max(500).optional(),
  description: z.string().optional(),
  heroImageUrl: z.string().url().optional().or(z.literal('')),
  heroImageMobileUrl: z.string().url().optional().or(z.literal('')),
  logoUrl: z.string().url().optional().or(z.literal('')),
  contentBlocks: z.any().optional(), // JSON array of content blocks
  ctaText: z.string().max(100).optional(),
  ctaUrl: z.string().url().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().optional().or(z.literal('')).or(z.null()),
  endsAt: z.string().datetime().optional().or(z.literal('')).or(z.null()),
});

export type CreateMarketingCampaignInput = z.infer<typeof createMarketingCampaignSchema>;

// ============================================================
// Update Marketing Campaign Schema
// ============================================================

export const updateMarketingCampaignSchema = createMarketingCampaignSchema.partial();

export type UpdateMarketingCampaignInput = z.infer<typeof updateMarketingCampaignSchema>;

// ============================================================
// Marketing Campaign Types
// ============================================================

export interface MarketingCampaign {
  id: string;
  name: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  heroImageUrl: string | null;
  heroImageMobileUrl: string | null;
  logoUrl: string | null;
  contentBlocks: unknown;
  ctaText: string | null;
  ctaUrl: string | null;
  isActive: boolean | null;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MarketingCampaignListItem {
  id: string;
  name: string;
  slug: string;
  title: string;
  isActive: boolean | null;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
}

// ============================================================
// Query Parameters
// ============================================================

export const getMarketingCampaignsParamsSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
});

export type GetMarketingCampaignsParams = z.infer<typeof getMarketingCampaignsParamsSchema>;
