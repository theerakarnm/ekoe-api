import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { uuidv7 } from 'uuidv7';
import { imageCompressionService, type CompressedImage } from './image-compression.service';

/**
 * Result from uploading an image with all compressed variants.
 */
export interface ImageUploadResult {
  /** Base URL without extension (e.g., https://cdn.example.com/products/abc123) */
  baseUrl: string;
  /** Primary URL (AVIF format) */
  url: string;
  /** All uploaded variant URLs by format */
  variants: {
    avif?: string;
    webp?: string;
    jpeg?: string;
  };
  /** Responsive image URLs by width */
  responsive: {
    avif?: Record<number, string>;
    webp?: Record<number, string>;
  };
  /** Compression statistics */
  stats?: {
    originalSizeBytes: number;
    compressedSizeBytes: number;
    savingsPercentage: number;
  };
}

export class StorageService {
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucket = process.env.R2_BUCKET_NAME || '';
    this.publicUrl = process.env.R2_PUBLIC_URL || '';

    if (!accountId || !accessKeyId || !secretAccessKey || !this.bucket) {
      console.warn('R2 storage configuration is missing. Uploads will fail.');
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || '',
      },
    });
  }

  /**
   * Upload a file to R2 storage.
   * For images, automatically compresses to AVIF/WebP/JPEG formats.
   * 
   * @param file The file to upload (File or Blob from Hono)
   * @param folder Optional folder path within the bucket
   * @param options Upload options
   * @returns Upload result with URLs for all variants
   */
  async uploadFile(
    file: File | Blob,
    folder: string = 'products',
    options: { skipCompression?: boolean } = {}
  ): Promise<string | ImageUploadResult> {
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type;
    const isImage = imageCompressionService.isSupportedImage(mimeType);

    // For non-images or when compression is skipped, use simple upload
    if (!isImage || options.skipCompression) {
      return this.uploadSimple(file, folder);
    }

    // Compress image and upload all variants
    return this.uploadCompressedImage(fileBuffer, folder);
  }

  /**
   * Simple file upload without compression.
   */
  private async uploadSimple(file: File | Blob, folder: string): Promise<string> {
    const fileNameStr = (file as File).name || 'file';
    const fileExtension = fileNameStr.split('.').pop() || 'bin';
    const fileName = `${folder}/${uuidv7()}.${fileExtension}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileName,
      Body: buffer,
      ContentType: file.type,
    });

    await this.client.send(command);
    return `${this.publicUrl}/${fileName}`;
  }

  /**
   * Compress and upload image in multiple formats.
   */
  private async uploadCompressedImage(
    buffer: Buffer,
    folder: string
  ): Promise<ImageUploadResult> {
    // Generate base ID for all variants
    const baseId = uuidv7();
    const basePath = `${folder}/${baseId}`;

    // Compress to all formats and sizes
    const result = await imageCompressionService.compress(buffer, {
      generateResponsiveSizes: true,
      maxWidth: 1920,
    });

    // Upload all variants in parallel
    const uploadPromises = result.variants.map(async (variant) => {
      const fileName = `${basePath}${variant.suffix}.${variant.format}`;
      await this.uploadBuffer(variant.buffer, fileName, `image/${variant.format}`);
      return {
        ...variant,
        url: `${this.publicUrl}/${fileName}`,
      };
    });

    const uploadedVariants = await Promise.all(uploadPromises);

    // Organize URLs by format and size
    const variants: ImageUploadResult['variants'] = {};
    const responsive: ImageUploadResult['responsive'] = {
      avif: {},
      webp: {},
    };

    for (const v of uploadedVariants) {
      // Main variants (no suffix = full size)
      if (v.suffix === '') {
        variants[v.format] = v.url;
      }

      // Responsive variants
      if (v.format === 'avif' && responsive.avif) {
        responsive.avif[v.width] = v.url;
      } else if (v.format === 'webp' && responsive.webp) {
        responsive.webp[v.width] = v.url;
      }
    }

    // Calculate total compressed size for AVIF variants
    const avifVariants = uploadedVariants.filter(v => v.format === 'avif');
    const compressedSize = avifVariants.reduce((sum, v) => sum + v.sizeBytes, 0);

    return {
      baseUrl: `${this.publicUrl}/${basePath}`,
      url: variants.avif || variants.webp || variants.jpeg || '',
      variants,
      responsive,
      stats: {
        originalSizeBytes: result.original.sizeBytes,
        compressedSizeBytes: compressedSize,
        savingsPercentage: result.savings.percentage,
      },
    };
  }

  /**
   * Upload a buffer directly to R2.
   */
  private async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    await this.client.send(command);
  }
}

export const storageService = new StorageService();
