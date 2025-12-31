import { eq } from 'drizzle-orm';
import { db } from '../../core/database';
import { siteSettings } from '../../core/database/schema/site-settings.schema';
import type { SiteSettingKey, SiteSettingValueMap } from './site-settings.interface';

class SiteSettingsRepository {
  /**
   * Get a setting by key
   */
  async getSetting<K extends SiteSettingKey>(key: K): Promise<SiteSettingValueMap[K] | null> {
    const result = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, key))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return result[0].value as SiteSettingValueMap[K];
  }

  /**
   * Get all settings
   */
  async getAllSettings(): Promise<Record<string, unknown>> {
    const results = await db.select().from(siteSettings);

    const settings: Record<string, unknown> = {};
    for (const row of results) {
      settings[row.key] = row.value;
    }

    return settings;
  }

  /**
   * Upsert a setting (create or update)
   */
  async upsertSetting<K extends SiteSettingKey>(
    key: K,
    value: SiteSettingValueMap[K],
    updatedBy?: string
  ): Promise<void> {
    const existing = await db
      .select()
      .from(siteSettings)
      .where(eq(siteSettings.key, key))
      .limit(1);

    if (existing.length === 0) {
      // Create new setting
      await db.insert(siteSettings).values({
        key,
        value,
        updatedBy,
        updatedAt: new Date(),
      });
    } else {
      // Update existing setting
      await db
        .update(siteSettings)
        .set({
          value,
          updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(siteSettings.key, key));
    }
  }

  /**
   * Delete a setting
   */
  async deleteSetting(key: SiteSettingKey): Promise<void> {
    await db.delete(siteSettings).where(eq(siteSettings.key, key));
  }
}

export const siteSettingsRepository = new SiteSettingsRepository();
