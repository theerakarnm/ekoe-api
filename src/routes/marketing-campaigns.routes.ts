import { Hono } from 'hono';
import { requireAdminAuth } from '../middleware/auth.middleware';
import { validateJson } from '../middleware/validation.middleware';
import { ResponseBuilder } from '../core/response';
import { marketingCampaignsDomain } from '../features/marketing-campaigns/marketing-campaigns.domain';
import {
  createMarketingCampaignSchema,
  updateMarketingCampaignSchema,
  getMarketingCampaignsParamsSchema,
} from '../features/marketing-campaigns/marketing-campaigns.interface';
import { auth } from '../libs/auth';

const marketingCampaignsRoutes = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

// ============================================================
// Public Endpoints
// ============================================================

/**
 * Get active campaign by slug (public)
 * Only returns campaigns that are active and within date range
 */
marketingCampaignsRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const campaign = await marketingCampaignsDomain.getActiveCampaignBySlug(slug);
  return ResponseBuilder.success(c, campaign);
});

// ============================================================
// Admin Endpoints
// ============================================================

/**
 * Get all campaigns (admin)
 */
marketingCampaignsRoutes.get('/admin/list', requireAdminAuth, async (c) => {
  const page = Number(c.req.query('page') || '1');
  const limit = Number(c.req.query('limit') || '20');
  const search = c.req.query('search');
  const status = (c.req.query('status') || 'all') as 'active' | 'inactive' | 'all';

  const params = getMarketingCampaignsParamsSchema.parse({
    page,
    limit,
    search,
    status,
  });

  const result = await marketingCampaignsDomain.getAllCampaigns(params);
  return ResponseBuilder.success(c, result);
});

/**
 * Get campaign by ID (admin)
 */
marketingCampaignsRoutes.get('/admin/:id', requireAdminAuth, async (c) => {
  const id = c.req.param('id');
  const campaign = await marketingCampaignsDomain.getCampaignById(id);
  return ResponseBuilder.success(c, campaign);
});

/**
 * Create campaign (admin)
 */
marketingCampaignsRoutes.post('/admin', requireAdminAuth, validateJson(createMarketingCampaignSchema), async (c) => {
  const data = await c.req.json();
  const campaign = await marketingCampaignsDomain.createCampaign(data);
  return ResponseBuilder.created(c, campaign);
});

/**
 * Update campaign (admin)
 */
marketingCampaignsRoutes.put('/admin/:id', requireAdminAuth, validateJson(updateMarketingCampaignSchema), async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const campaign = await marketingCampaignsDomain.updateCampaign(id, data);
  return ResponseBuilder.success(c, campaign);
});

/**
 * Delete campaign (admin)
 */
marketingCampaignsRoutes.delete('/admin/:id', requireAdminAuth, async (c) => {
  const id = c.req.param('id');
  await marketingCampaignsDomain.deleteCampaign(id);
  return ResponseBuilder.noContent(c);
});

export default marketingCampaignsRoutes;
