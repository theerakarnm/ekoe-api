#!/usr/bin/env bun
/**
 * Static Image Optimization Script
 * 
 * Scans web/public folder for images and generates optimized AVIF/WebP versions.
 * 
 * Usage:
 *   bun run script/optimize-static-images.ts
 *   bun run script/optimize-static-images.ts --dry-run
 *   bun run script/optimize-static-images.ts --delete-originals
 */

import { readdir, stat, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, dirname, basename } from 'path';
import sharp from 'sharp';

// Configuration
const config = {
  inputDir: join(import.meta.dirname!, '../../web/public/ekoe-asset'),
  supportedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  outputFormats: ['avif', 'webp'] as const,
  quality: {
    avif: 75,
    webp: 80,
  },
  // Skip files smaller than this (already optimized)
  minSizeBytes: 10 * 1024, // 10KB
};

interface FileStats {
  path: string;
  originalSize: number;
  avifSize?: number;
  webpSize?: number;
  savings: number;
  savingsPercent: number;
}

async function findImages(dir: string): Promise<string[]> {
  const images: string[] = [];

  async function scan(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (config.supportedExtensions.includes(ext)) {
          images.push(fullPath);
        }
      }
    }
  }

  await scan(dir);
  return images;
}

async function optimizeImage(imagePath: string, dryRun: boolean): Promise<FileStats | null> {
  const fileInfo = await stat(imagePath);

  if (fileInfo.size < config.minSizeBytes) {
    console.log(`⏭️  Skipping (too small): ${basename(imagePath)}`);
    return null;
  }

  const ext = extname(imagePath);
  const basePath = imagePath.slice(0, -ext.length);

  // Skip if already has optimized versions
  if (existsSync(`${basePath}.avif`) && existsSync(`${basePath}.webp`)) {
    console.log(`⏭️  Skipping (already optimized): ${basename(imagePath)}`);
    return null;
  }

  const stats: FileStats = {
    path: imagePath,
    originalSize: fileInfo.size,
    savings: 0,
    savingsPercent: 0,
  };

  try {
    const image = sharp(imagePath);

    // Generate AVIF
    const avifPath = `${basePath}.avif`;
    if (!dryRun) {
      const avifBuffer = await image.clone().avif({ quality: config.quality.avif }).toBuffer();
      await Bun.write(avifPath, avifBuffer);
      stats.avifSize = avifBuffer.length;
      console.log(`✅ AVIF: ${basename(avifPath)} (${formatSize(avifBuffer.length)})`);
    } else {
      console.log(`🔍 Would create: ${basename(avifPath)}`);
    }

    // Generate WebP
    const webpPath = `${basePath}.webp`;
    if (!dryRun) {
      const webpBuffer = await image.clone().webp({ quality: config.quality.webp }).toBuffer();
      await Bun.write(webpPath, webpBuffer);
      stats.webpSize = webpBuffer.length;
      console.log(`✅ WebP: ${basename(webpPath)} (${formatSize(webpBuffer.length)})`);
    } else {
      console.log(`🔍 Would create: ${basename(webpPath)}`);
    }

    // Calculate savings (using AVIF as primary)
    if (stats.avifSize) {
      stats.savings = stats.originalSize - stats.avifSize;
      stats.savingsPercent = (stats.savings / stats.originalSize) * 100;
    }

    return stats;
  } catch (error) {
    console.error(`❌ Error processing ${basename(imagePath)}:`, error);
    return null;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const deleteOriginals = args.includes('--delete-originals');

  console.log('🖼️  Static Image Optimization Script');
  console.log('=====================================\n');

  if (dryRun) {
    console.log('📋 DRY RUN MODE - No files will be modified\n');
  }

  if (!existsSync(config.inputDir)) {
    console.error(`❌ Input directory not found: ${config.inputDir}`);
    process.exit(1);
  }

  console.log(`📂 Scanning: ${config.inputDir}\n`);

  const images = await findImages(config.inputDir);
  console.log(`📸 Found ${images.length} images to process\n`);

  const results: FileStats[] = [];
  let totalOriginalSize = 0;
  let totalCompressedSize = 0;

  for (const imagePath of images) {
    const result = await optimizeImage(imagePath, dryRun);
    if (result) {
      results.push(result);
      totalOriginalSize += result.originalSize;
      if (result.avifSize) {
        totalCompressedSize += result.avifSize;
      }
    }
  }

  // Print summary
  console.log('\n=====================================');
  console.log('📊 SUMMARY');
  console.log('=====================================');
  console.log(`Total images processed: ${results.length}`);
  console.log(`Original total size: ${formatSize(totalOriginalSize)}`);
  console.log(`Compressed total size (AVIF): ${formatSize(totalCompressedSize)}`);
  console.log(`Total savings: ${formatSize(totalOriginalSize - totalCompressedSize)}`);
  console.log(`Average compression: ${((1 - totalCompressedSize / totalOriginalSize) * 100).toFixed(1)}%`);

  if (deleteOriginals && !dryRun) {
    console.log('\n⚠️  --delete-originals flag is set but not implemented for safety.');
    console.log('   Please manually delete original files after verification.');
  }
}

main().catch(console.error);
