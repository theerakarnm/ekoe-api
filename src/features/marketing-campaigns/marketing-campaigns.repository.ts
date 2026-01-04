import { eq, desc, and, isNull, or, like } from 'drizzle-orm';
import { db } from '../../core/database';
import { marketingCampaigns, campaignRegistrations } from '../../core/database/schema';
import type { CreateMarketingCampaignInput, UpdateMarketingCampaignInput, MarketingCampaign, MarketingCampaignListItem, GetMarketingCampaignsParams, CampaignRegistration } from './marketing-campaigns.interface';

class MarketingCampaignsRepository {
  /**
   * Get all marketing campaigns with pagination and filtering
   */
  async getAll(params: GetMarketingCampaignsParams): Promise<{ data: MarketingCampaignListItem[]; total: number }> {
    const { page, limit, search, status } = params;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [isNull(marketingCampaigns.deletedAt)];

    if (search) {
      conditions.push(
        or(
          like(marketingCampaigns.name, `%${search}%`),
          like(marketingCampaigns.title, `%${search}%`)
        )!
      );
    }

    if (status === 'active') {
      conditions.push(eq(marketingCampaigns.isActive, true));
    } else if (status === 'inactive') {
      conditions.push(eq(marketingCampaigns.isActive, false));
    }

    const whereClause = and(...conditions);

    const [data, countResult] = await Promise.all([
      db
        .select({
          id: marketingCampaigns.id,
          name: marketingCampaigns.name,
          slug: marketingCampaigns.slug,
          title: marketingCampaigns.title,
          isActive: marketingCampaigns.isActive,
          startsAt: marketingCampaigns.startsAt,
          endsAt: marketingCampaigns.endsAt,
          createdAt: marketingCampaigns.createdAt,
        })
        .from(marketingCampaigns)
        .where(whereClause)
        .orderBy(desc(marketingCampaigns.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: marketingCampaigns.id })
        .from(marketingCampaigns)
        .where(whereClause),
    ]);

    return {
      data,
      total: countResult.length,
    };
  }

  /**
   * Get a campaign by ID
   */
  async getById(id: string): Promise<MarketingCampaign | null> {
    const [campaign] = await db
      .select()
      .from(marketingCampaigns)
      .where(and(eq(marketingCampaigns.id, id), isNull(marketingCampaigns.deletedAt)));

    return campaign || null;
  }

  /**
   * Get a campaign by slug (for public access)
   */
  async getBySlug(slug: string): Promise<MarketingCampaign | null> {
    const [campaign] = await db
      .select()
      .from(marketingCampaigns)
      .where(and(eq(marketingCampaigns.slug, slug), isNull(marketingCampaigns.deletedAt)));

    return campaign || null;
  }

  /**
   * Check if slug exists
   */
  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const conditions = [eq(marketingCampaigns.slug, slug), isNull(marketingCampaigns.deletedAt)];

    const [existing] = await db
      .select({ id: marketingCampaigns.id })
      .from(marketingCampaigns)
      .where(and(...conditions));

    if (!existing) return false;
    if (excludeId && existing.id === excludeId) return false;
    return true;
  }

  /**
   * Create a new campaign
   */
  async create(data: CreateMarketingCampaignInput): Promise<MarketingCampaign> {
    const [campaign] = await db
      .insert(marketingCampaigns)
      .values({
        name: data.name,
        slug: data.slug,
        title: data.title,
        subtitle: data.subtitle || null,
        description: data.description || null,
        heroImageUrl: data.heroImageUrl || null,
        heroImageMobileUrl: data.heroImageMobileUrl || null,
        logoUrl: data.logoUrl || null,
        contentBlocks: data.contentBlocks || null,
        ctaText: data.ctaText || null,
        ctaUrl: data.ctaUrl || null,
        isActive: data.isActive ?? true,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
      })
      .returning();

    return campaign;
  }

  /**
   * Update a campaign
   */
  async update(id: string, data: UpdateMarketingCampaignInput): Promise<MarketingCampaign | null> {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.title !== undefined) updateData.title = data.title;
    if (data.subtitle !== undefined) updateData.subtitle = data.subtitle || null;
    if (data.description !== undefined) updateData.description = data.description || null;
    if (data.heroImageUrl !== undefined) updateData.heroImageUrl = data.heroImageUrl || null;
    if (data.heroImageMobileUrl !== undefined) updateData.heroImageMobileUrl = data.heroImageMobileUrl || null;
    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl || null;
    if (data.contentBlocks !== undefined) updateData.contentBlocks = data.contentBlocks || null;
    if (data.ctaText !== undefined) updateData.ctaText = data.ctaText || null;
    if (data.ctaUrl !== undefined) updateData.ctaUrl = data.ctaUrl || null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.startsAt !== undefined) updateData.startsAt = data.startsAt ? new Date(data.startsAt) : null;
    if (data.endsAt !== undefined) updateData.endsAt = data.endsAt ? new Date(data.endsAt) : null;

    const [campaign] = await db
      .update(marketingCampaigns)
      .set(updateData)
      .where(and(eq(marketingCampaigns.id, id), isNull(marketingCampaigns.deletedAt)))
      .returning();

    return campaign || null;
  }

  /**
   * Soft delete a campaign
   */
  async delete(id: string): Promise<boolean> {
    const [deleted] = await db
      .update(marketingCampaigns)
      .set({ deletedAt: new Date() })
      .where(and(eq(marketingCampaigns.id, id), isNull(marketingCampaigns.deletedAt)))
      .returning({ id: marketingCampaigns.id });

    return !!deleted;
  }

  // ============================================================
  // Registration Methods
  // ============================================================

  /**
   * Create a phone registration for a campaign
   */
  async createRegistration(campaignId: string, phoneNumber: string): Promise<CampaignRegistration> {
    const [registration] = await db
      .insert(campaignRegistrations)
      .values({
        campaignId,
        phoneNumber,
      })
      .returning();

    return registration;
  }

  /**
   * Get registrations for a campaign
   */
  async getRegistrations(campaignId: string): Promise<CampaignRegistration[]> {
    return db
      .select()
      .from(campaignRegistrations)
      .where(eq(campaignRegistrations.campaignId, campaignId))
      .orderBy(desc(campaignRegistrations.createdAt));
  }

  /**
   * Get registration count for a campaign
   */
  async getRegistrationCount(campaignId: string): Promise<number> {
    const result = await db
      .select({ id: campaignRegistrations.id })
      .from(campaignRegistrations)
      .where(eq(campaignRegistrations.campaignId, campaignId));
    return result.length;
  }

  /**
   * Delete a registration
   */
  async deleteRegistration(id: string): Promise<boolean> {
    const [deleted] = await db
      .delete(campaignRegistrations)
      .where(eq(campaignRegistrations.id, id))
      .returning({ id: campaignRegistrations.id });

    return !!deleted;
  }
}

export const marketingCampaignsRepository = new MarketingCampaignsRepository();

