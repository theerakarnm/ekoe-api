import sharp from 'sharp';
import { imageCompressionConfig, type ImageFormat } from './image-compression.config';

/**
 * Compressed image data for a specific format and size.
 */
export interface CompressedImage {
  format: ImageFormat;
  width: number;
  buffer: Buffer;
  sizeBytes: number;
  suffix: string; // e.g., '_640w' or '' for original size
}

/**
 * Result of compressing an image with all variants.
 */
export interface CompressionResult {
  original: {
    sizeBytes: number;
    format: string;
    width: number;
    height: number;
  };
  variants: CompressedImage[];
  savings: {
    bytes: number;
    percentage: number;
  };
}

/**
 * Options for image compression.
 */
export interface CompressOptions {
  /** Generate responsive size variants */
  generateResponsiveSizes?: boolean;
  /** Maximum width to resize to (maintains aspect ratio) */
  maxWidth?: number;
  /** Custom quality overrides */
  quality?: Partial<Record<ImageFormat, number>>;
}

/**
 * Service for compressing images to AVIF/WebP/JPEG formats.
 * 
 * Uses sharp library for high-performance image processing.
 * Generates multiple formats and responsive sizes for optimal browser delivery.
 */
export class ImageCompressionService {
  private config = imageCompressionConfig;

  /**
   * Check if a MIME type is a supported image format.
   */
  isSupportedImage(mimeType: string): boolean {
    return this.config.supportedInputFormats.includes(mimeType);
  }

  /**
   * Compress an image buffer to all configured formats and sizes.
   * 
   * @param input - Raw image buffer
   * @param options - Compression options
   * @returns Compression result with all variants
   */
  async compress(
    input: Buffer,
    options: CompressOptions = {}
  ): Promise<CompressionResult> {
    const {
      generateResponsiveSizes = true,
      maxWidth = 1920,
      quality = {},
    } = options;

    // Get original image metadata
    const metadata = await sharp(input).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;
    const originalFormat = metadata.format || 'unknown';

    // Determine sizes to generate
    const sizesToGenerate = generateResponsiveSizes
      ? this.config.responsiveSizes.filter(size => size <= originalWidth)
      : [];

    // Always include max size (capped at original width)
    const maxSize = Math.min(maxWidth, originalWidth);
    if (!sizesToGenerate.includes(maxSize)) {
      sizesToGenerate.push(maxSize);
    }

    const variants: CompressedImage[] = [];
    let totalCompressedSize = 0;

    // Generate each format at each size
    for (const format of this.config.generateFormats) {
      for (const width of sizesToGenerate) {
        const suffix = width === maxSize ? '' : `_${width}w`;
        const qualityValue = quality[format] ?? this.config.quality[format];

        const compressed = await this.compressToFormat(
          input,
          format,
          width,
          qualityValue
        );

        variants.push({
          format,
          width,
          buffer: compressed,
          sizeBytes: compressed.length,
          suffix,
        });

        // Count only the primary AVIF variants for savings calculation
        if (format === 'avif') {
          totalCompressedSize += compressed.length;
        }
      }
    }

    const originalSize = input.length;
    const savings = originalSize - totalCompressedSize;
    const savingsPercentage = (savings / originalSize) * 100;

    return {
      original: {
        sizeBytes: originalSize,
        format: originalFormat,
        width: originalWidth,
        height: originalHeight,
      },
      variants,
      savings: {
        bytes: savings,
        percentage: Math.round(savingsPercentage * 10) / 10,
      },
    };
  }

  /**
   * Compress a single image to a specific format.
   */
  private async compressToFormat(
    input: Buffer,
    format: ImageFormat,
    width: number,
    quality: number
  ): Promise<Buffer> {
    let pipeline = sharp(input)
      .resize(width, null, {
        withoutEnlargement: true,
        fit: 'inside',
      });

    // Strip metadata if configured
    if (this.config.stripMetadata) {
      pipeline = pipeline.rotate(); // Auto-rotate based on EXIF, then strip
    }

    switch (format) {
      case 'avif':
        return pipeline.avif({
          quality,
          effort: this.config.avif.effort,
          chromaSubsampling: this.config.avif.chromaSubsampling,
        }).toBuffer();

      case 'webp':
        return pipeline.webp({
          quality,
          effort: this.config.webp.effort,
          nearLossless: this.config.webp.nearLossless,
        }).toBuffer();

      case 'jpeg':
        return pipeline.jpeg({
          quality,
          mozjpeg: this.config.jpeg.mozjpeg,
          progressive: this.config.jpeg.progressive,
        }).toBuffer();

      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Get a simple compressed version in a single format.
   * Useful for quick previews or thumbnails.
   */
  async compressSingle(
    input: Buffer,
    format: ImageFormat = 'webp',
    width?: number,
    quality?: number
  ): Promise<Buffer> {
    return this.compressToFormat(
      input,
      format,
      width || 1920,
      quality ?? this.config.quality[format]
    );
  }
}

export const imageCompressionService = new ImageCompressionService();
