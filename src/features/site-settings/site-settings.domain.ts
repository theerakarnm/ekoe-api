import { siteSettingsRepository } from './site-settings.repository';
import type {
  SiteSettingKey,
  SiteSettingValueMap,
  HeroSlidesSetting,
  FeatureSectionSetting,
  OnlineExecutiveSetting,
  WelcomePopupSetting,
} from './site-settings.interface';

// Default values that match current hardcoded content
const DEFAULT_HERO_SLIDES: HeroSlidesSetting = [
  {
    id: 1,
    title: "One of Everything Really Good",
    subtitle: "ที่ Ekoe - ปรัชญาที่เรียบง่ายของเราคือ การทําให้ทุกอย่างดีจริงๆ สําหรับเรา นั่นหมายถึงผลิตภัณฑ์ที่จําเป็น ไว้ใจได้และมีประสิทธิภาพสูง ให้คุณหยิบใช้ได้ทุกวัน เป็นสิ่งที่คุณรัก และกลับมาใช้ เสมอเพื่อบํารุงผิวที่ดีที่สุดของคุณ",
    description: "",
    media: {
      type: 'video',
      url: '/ekoe-asset/branding-vid.mp4'
    }
  },
  {
    id: 2,
    title: "Nature's Best Kept Secret",
    subtitle: "ความลับจากธรรมชาติที่ดีที่สุด",
    description: "สัมผัสประสบการณ์การดูแลผิวที่เหนือระดับ ด้วยส่วนผสมที่คัดสรรมาจากธรรมชาติ",
    media: {
      type: 'image',
      url: '/ekoe-asset/branding-img2.png'
    }
  }
];

const DEFAULT_FEATURE_SECTION: FeatureSectionSetting = {
  leftImage: '/ekoe-asset/HOME/Glowthat_sworth.png',
  rightImage: '/ekoe-asset/HOME/หนึ่งอย่างที่ดีจริง.png',
  leftTitle: "",
  leftDescription: "",
  leftButtonText: "",
  rightTitle: "",
  rightDescription: "",
  rightHighlightText: "",
  rightButtonText: "",
};

const DEFAULT_ONLINE_EXECUTIVE: OnlineExecutiveSetting = {
  mainImage: '/ekoe-asset/ONLINE_EXECUTIVE/ONLINE_EXECUTIVE.png',
  quoteImage: '/ekoe-asset/PHOTO/ONLINE EXECUTIVE_BOTTOM_Ekoe สร้างประสบการณ์พิเศษ.png',
  quoteText: 'Ekoe สร้างประสบการณ์พิเศษใน\nการดูแลผิว ให้เป็นเรื่องธรรมดาสำหรับคุณ',
};

const DEFAULT_WELCOME_POPUP: WelcomePopupSetting = {
  image: '/ekoe-asset/HOME/POPUP.JPG',
  title: 'เปิดประสบการณ์ใหม่กับ Ekoe',
  subtitle: 'Effective natural formulations for skin that\'s alive, evolving, beautifully yours.',
  description: 'โค้ดพิเศษสำหรับคุณ',
  terms: [
    '*โค้ดมีจำนวนจำกัด',
    '*เฉพาะการสั่งซื้อครั้งแรกที่ Ekoe',
    '*ใช้ได้กับยอดหลังหักส่วนลด',
    '*ใช้ร่วมกับ Online Executive ได้',
    '*ส่งฟรีทุกออร์เดอร์',
  ],
};

const DEFAULTS: Record<SiteSettingKey, unknown> = {
  hero_slides: DEFAULT_HERO_SLIDES,
  feature_section: DEFAULT_FEATURE_SECTION,
  online_executive: DEFAULT_ONLINE_EXECUTIVE,
  welcome_popup: DEFAULT_WELCOME_POPUP,
};

class SiteSettingsDomain {
  /**
   * Get a setting by key, with fallback to default
   */
  async getSetting<K extends SiteSettingKey>(key: K): Promise<SiteSettingValueMap[K]> {
    const setting = await siteSettingsRepository.getSetting(key);
    if (setting) {
      return setting;
    }
    return DEFAULTS[key] as SiteSettingValueMap[K];
  }

  /**
   * Get all settings with defaults for missing keys
   */
  async getAllSettings(): Promise<{
    hero_slides: HeroSlidesSetting;
    feature_section: FeatureSectionSetting;
    online_executive: OnlineExecutiveSetting;
    welcome_popup: WelcomePopupSetting;
  }> {
    const stored = await siteSettingsRepository.getAllSettings();

    return {
      hero_slides: (stored.hero_slides as HeroSlidesSetting) ?? DEFAULT_HERO_SLIDES,
      feature_section: (stored.feature_section as FeatureSectionSetting) ?? DEFAULT_FEATURE_SECTION,
      online_executive: (stored.online_executive as OnlineExecutiveSetting) ?? DEFAULT_ONLINE_EXECUTIVE,
      welcome_popup: (stored.welcome_popup as WelcomePopupSetting) ?? DEFAULT_WELCOME_POPUP,
    };
  }

  /**
   * Update a setting
   */
  async updateSetting<K extends SiteSettingKey>(
    key: K,
    value: SiteSettingValueMap[K],
    updatedBy?: string
  ): Promise<SiteSettingValueMap[K]> {
    await siteSettingsRepository.upsertSetting(key, value, updatedBy);
    return value;
  }

  /**
   * Get hero slides
   */
  async getHeroSlides(): Promise<HeroSlidesSetting> {
    return this.getSetting('hero_slides');
  }

  /**
   * Get feature section settings
   */
  async getFeatureSection(): Promise<FeatureSectionSetting> {
    return this.getSetting('feature_section');
  }

  /**
   * Get online executive settings
   */
  async getOnlineExecutive(): Promise<OnlineExecutiveSetting> {
    return this.getSetting('online_executive');
  }

  /**
   * Get welcome popup settings
   */
  async getWelcomePopup(): Promise<WelcomePopupSetting> {
    return this.getSetting('welcome_popup');
  }
}

export const siteSettingsDomain = new SiteSettingsDomain();
