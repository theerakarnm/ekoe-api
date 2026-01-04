import { marketingCampaignsRepository } from './marketing-campaigns.repository';
import { AppError } from '../../core/errors';
import type {
  CreateMarketingCampaignInput,
  UpdateMarketingCampaignInput,
  MarketingCampaign,
  GetMarketingCampaignsParams,
  CampaignRegistration,
} from './marketing-campaigns.interface';

class MarketingCampaignsDomain {
  /**
   * Get all campaigns with pagination
   */
  async getAllCampaigns(params: GetMarketingCampaignsParams) {
    return marketingCampaignsRepository.getAll(params);
  }

  /**
   * Get a campaign by ID
   */
  async getCampaignById(id: string): Promise<MarketingCampaign> {
    const campaign = await marketingCampaignsRepository.getById(id);
    if (!campaign) {
      throw new AppError('Campaign not found', 404, 'NOT_FOUND');
    }
    return campaign;
  }

  /**
   * Get a campaign by slug (for public page)
   */
  async getCampaignBySlug(slug: string): Promise<MarketingCampaign> {
    const campaign = await marketingCampaignsRepository.getBySlug(slug);
    if (!campaign) {
      throw new AppError('Campaign not found', 404, 'NOT_FOUND');
    }
    return campaign;
  }

  /**
   * Get active campaign by slug (checks dates and active status)
   */
  async getActiveCampaignBySlug(slug: string): Promise<MarketingCampaign> {
    const campaign = await marketingCampaignsRepository.getBySlug(slug);

    if (!campaign) {
      throw new AppError('Campaign not found', 404, 'NOT_FOUND');
    }

    // Check if campaign is active
    if (!campaign.isActive) {
      throw new AppError('Campaign is not active', 404, 'NOT_FOUND');
    }

    // Check date range
    const now = new Date();
    if (campaign.startsAt && now < campaign.startsAt) {
      throw new AppError('Campaign has not started yet', 404, 'NOT_FOUND');
    }
    if (campaign.endsAt && now > campaign.endsAt) {
      throw new AppError('Campaign has ended', 404, 'NOT_FOUND');
    }

    return campaign;
  }

  /**
   * Create a new campaign
   */
  async createCampaign(data: CreateMarketingCampaignInput): Promise<MarketingCampaign> {
    // Check if slug already exists
    const slugExists = await marketingCampaignsRepository.slugExists(data.slug);
    if (slugExists) {
      throw new AppError('Slug already exists', 400, 'SLUG_EXISTS');
    }

    // Validate date range
    if (data.startsAt && data.endsAt) {
      const startDate = new Date(data.startsAt);
      const endDate = new Date(data.endsAt);
      if (endDate <= startDate) {
        throw new AppError('End date must be after start date', 400, 'INVALID_DATE_RANGE');
      }
    }

    return marketingCampaignsRepository.create(data);
  }

  /**
   * Update a campaign
   */
  async updateCampaign(id: string, data: UpdateMarketingCampaignInput): Promise<MarketingCampaign> {
    // Check campaign exists
    const existing = await marketingCampaignsRepository.getById(id);
    if (!existing) {
      throw new AppError('Campaign not found', 404, 'NOT_FOUND');
    }

    // Check slug uniqueness if updating slug
    if (data.slug && data.slug !== existing.slug) {
      const slugExists = await marketingCampaignsRepository.slugExists(data.slug, id);
      if (slugExists) {
        throw new AppError('Slug already exists', 400, 'SLUG_EXISTS');
      }
    }

    // Validate date range
    const startsAt = data.startsAt !== undefined ? data.startsAt : (existing.startsAt?.toISOString() || null);
    const endsAt = data.endsAt !== undefined ? data.endsAt : (existing.endsAt?.toISOString() || null);

    if (startsAt && endsAt) {
      const startDate = new Date(startsAt);
      const endDate = new Date(endsAt);
      if (endDate <= startDate) {
        throw new AppError('End date must be after start date', 400, 'INVALID_DATE_RANGE');
      }
    }

    const updated = await marketingCampaignsRepository.update(id, data);
    if (!updated) {
      throw new AppError('Failed to update campaign', 500, 'UPDATE_FAILED');
    }

    return updated;
  }

  /**
   * Delete a campaign
   */
  async deleteCampaign(id: string): Promise<void> {
    const exists = await marketingCampaignsRepository.getById(id);
    if (!exists) {
      throw new AppError('Campaign not found', 404, 'NOT_FOUND');
    }

    const deleted = await marketingCampaignsRepository.delete(id);
    if (!deleted) {
      throw new AppError('Failed to delete campaign', 500, 'DELETE_FAILED');
    }
  }

  /**
   * Generate a URL-friendly slug from a name
   */
  generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // ============================================================
  // Registration Methods
  // ============================================================

  /**
   * Register a phone number for a campaign
   */
  async registerPhone(campaignId: string, phoneNumber: string): Promise<CampaignRegistration> {
    // Verify campaign exists and is active
    const campaign = await marketingCampaignsRepository.getById(campaignId);
    if (!campaign) {
      throw new AppError('Campaign not found', 404, 'NOT_FOUND');
    }

    return marketingCampaignsRepository.createRegistration(campaignId, phoneNumber);
  }

  /**
   * Get registrations for a campaign (admin)
   */
  async getCampaignRegistrations(campaignId: string): Promise<CampaignRegistration[]> {
    // Verify campaign exists
    const campaign = await marketingCampaignsRepository.getById(campaignId);
    if (!campaign) {
      throw new AppError('Campaign not found', 404, 'NOT_FOUND');
    }

    return marketingCampaignsRepository.getRegistrations(campaignId);
  }

  /**
   * Delete a registration (admin)
   */
  async deleteRegistration(id: string): Promise<void> {
    const deleted = await marketingCampaignsRepository.deleteRegistration(id);
    if (!deleted) {
      throw new AppError('Registration not found', 404, 'NOT_FOUND');
    }
  }
}

export const marketingCampaignsDomain = new MarketingCampaignsDomain();

