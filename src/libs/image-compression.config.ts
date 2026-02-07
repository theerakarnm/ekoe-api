/**
 * Image Compression Configuration
 * 
 * Centralized configuration for AVIF/WebP/JPEG image optimization.
 */

export const imageCompressionConfig = {
  /**
   * Quality settings per format (1-100).
   * Lower values = smaller files but potentially visible artifacts.
   * Recommended: AVIF 70-80, WebP 75-85, JPEG 80-90
   */
  quality: {
    avif: 75,   // Best compression, slowest encoding
    webp: 80,   // Good compression, fast encoding
    jpeg: 85,   // Fallback for older browsers
  },

  /**
   * Responsive image widths to generate.
   * Used for srcset to serve appropriately sized images.
   */
  responsiveSizes: [320, 640, 1024, 1920],

  /**
   * Maximum allowed original file size (in bytes).
   * Files exceeding this will be rejected.
   */
  maxOriginalSize: 10 * 1024 * 1024, // 10MB

  /**
   * Whether to strip EXIF/metadata from images.
   * Reduces file size and protects privacy.
   */
  stripMetadata: true,

  /**
   * Formats to generate for each uploaded image.
   * Order matters: first format is preferred.
   */
  generateFormats: ['avif', 'webp', 'jpeg'] as const,

  /**
   * AVIF-specific encoding settings.
   */
  avif: {
    effort: 4,  // 0-9, higher = slower but better compression
    chromaSubsampling: '4:2:0',
  },

  /**
   * WebP-specific encoding settings.
   */
  webp: {
    effort: 4,  // 0-6, higher = slower but better compression
    nearLossless: false,
  },

  /**
   * JPEG-specific encoding settings.
   */
  jpeg: {
    mozjpeg: true,  // Use MozJPEG for better compression
    progressive: true,
  },

  /**
   * Supported input formats.
   */
  supportedInputFormats: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
};

export type ImageFormat = typeof imageCompressionConfig.generateFormats[number];
