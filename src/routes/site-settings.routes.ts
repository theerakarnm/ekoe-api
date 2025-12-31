import { Hono } from 'hono';
import { requireAdminAuth } from '../middleware/auth.middleware';
import { validateJson } from '../middleware/validation.middleware';
import { ResponseBuilder } from '../core/response';
import { siteSettingsDomain } from '../features/site-settings/site-settings.domain';
import {
  siteSettingKeySchema,
  updateSiteSettingSchema,
} from '../features/site-settings/site-settings.interface';
import { auth } from '../libs/auth';

const siteSettingsRoutes = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null
  }
}>();

// ============================================================
// Public Endpoints (for frontend consumption)
// ============================================================

/**
 * Get a single setting by key (public)
 * Used by frontend components to fetch their content
 */
siteSettingsRoutes.get('/:key', async (c) => {
  const keyParam = c.req.param('key');

  // Validate key
  const keyResult = siteSettingKeySchema.safeParse(keyParam);
  if (!keyResult.success) {
    return ResponseBuilder.error(c, `Invalid setting key: ${keyParam}`, 400, 'VALIDATION_ERROR');
  }

  const key = keyResult.data;
  const value = await siteSettingsDomain.getSetting(key);

  return ResponseBuilder.success(c, { key, value });
});

/**
 * Get all public settings (for SSR)
 * Useful for loading all settings in one request
 */
siteSettingsRoutes.get('/', async (c) => {
  const settings = await siteSettingsDomain.getAllSettings();
  return ResponseBuilder.success(c, settings);
});

// ============================================================
// Admin Endpoints (require authentication)
// ============================================================

/**
 * Get all settings for admin
 */
siteSettingsRoutes.get('/admin/all', requireAdminAuth, async (c) => {
  const settings = await siteSettingsDomain.getAllSettings();
  return ResponseBuilder.success(c, settings);
});

/**
 * Update a setting
 */
siteSettingsRoutes.put('/admin/:key', requireAdminAuth, async (c) => {
  const keyParam = c.req.param('key');
  const body = await c.req.json();
  const user = c.get('user');

  // Validate key
  const keyResult = siteSettingKeySchema.safeParse(keyParam);
  if (!keyResult.success) {
    return ResponseBuilder.error(c, `Invalid setting key: ${keyParam}`, 400, 'VALIDATION_ERROR');
  }

  const key = keyResult.data;

  // Validate body with full schema
  const updateData = { key, value: body.value };
  const validation = updateSiteSettingSchema.safeParse(updateData);

  if (!validation.success) {
    return ResponseBuilder.error(
      c,
      `Validation error: ${validation.error.message}`,
      400,
      'VALIDATION_ERROR'
    );
  }

  const updated = await siteSettingsDomain.updateSetting(
    key,
    validation.data.value,
    user?.id
  );

  return ResponseBuilder.success(c, { key, value: updated });
});

export default siteSettingsRoutes;
