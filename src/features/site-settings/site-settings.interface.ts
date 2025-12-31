import { z } from 'zod';

// ============================================================
// Hero Section Types
// ============================================================

export const heroSlideMediaSchema = z.object({
  type: z.enum(['image', 'video']),
  url: z.string().min(1, 'Media URL is required'),
});

export const heroSlideSchema = z.object({
  id: z.number(),
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().default(''),
  description: z.string().default(''),
  media: heroSlideMediaSchema,
});

export const heroSlidesSettingSchema = z.array(heroSlideSchema);

export type HeroSlideMedia = z.infer<typeof heroSlideMediaSchema>;
export type HeroSlide = z.infer<typeof heroSlideSchema>;
export type HeroSlidesSetting = z.infer<typeof heroSlidesSettingSchema>;

// ============================================================
// Feature Section Types
// ============================================================

export const featureSectionSettingSchema = z.object({
  leftImage: z.string().min(1, 'Left image URL is required'),
  rightImage: z.string().min(1, 'Right image URL is required'),
});

export type FeatureSectionSetting = z.infer<typeof featureSectionSettingSchema>;

// ============================================================
// Online Executive Types
// ============================================================

export const onlineExecutiveSettingSchema = z.object({
  mainImage: z.string().min(1, 'Main image URL is required'),
  quoteImage: z.string().min(1, 'Quote image URL is required'),
  quoteText: z.string().min(1, 'Quote text is required'),
});

export type OnlineExecutiveSetting = z.infer<typeof onlineExecutiveSettingSchema>;

// ============================================================
// Welcome Popup Types
// ============================================================

export const welcomePopupSettingSchema = z.object({
  image: z.string().min(1, 'Popup image URL is required'),
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().default(''),
  description: z.string().default(''),
  terms: z.array(z.string()).default([]),
});

export type WelcomePopupSetting = z.infer<typeof welcomePopupSettingSchema>;

// ============================================================
// Combined Site Settings
// ============================================================

export const siteSettingKeySchema = z.enum([
  'hero_slides',
  'feature_section',
  'online_executive',
  'welcome_popup',
]);

export type SiteSettingKey = z.infer<typeof siteSettingKeySchema>;

// Update setting request schemas
export const updateHeroSlidesSchema = z.object({
  key: z.literal('hero_slides'),
  value: heroSlidesSettingSchema,
});

export const updateFeatureSectionSchema = z.object({
  key: z.literal('feature_section'),
  value: featureSectionSettingSchema,
});

export const updateOnlineExecutiveSchema = z.object({
  key: z.literal('online_executive'),
  value: onlineExecutiveSettingSchema,
});

export const updateWelcomePopupSchema = z.object({
  key: z.literal('welcome_popup'),
  value: welcomePopupSettingSchema,
});

export const updateSiteSettingSchema = z.discriminatedUnion('key', [
  updateHeroSlidesSchema,
  updateFeatureSectionSchema,
  updateOnlineExecutiveSchema,
  updateWelcomePopupSchema,
]);

export type UpdateSiteSettingInput = z.infer<typeof updateSiteSettingSchema>;

// Site setting value types mapped by key
export interface SiteSettingValueMap {
  hero_slides: HeroSlidesSetting;
  feature_section: FeatureSectionSetting;
  online_executive: OnlineExecutiveSetting;
  welcome_popup: WelcomePopupSetting;
}
