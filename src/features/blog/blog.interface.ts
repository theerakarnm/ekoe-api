import { z } from 'zod';

// ============================================================================
// Content Block Types
// ============================================================================

// Block metadata (common to all blocks)
const blockMetadataSchema = z.object({
  id: z.string(),
  anchorId: z.string().optional(),
});

// Text block - rich text content
const textBlockSchema = blockMetadataSchema.extend({
  type: z.literal('text'),
  content: z.string(),
});

// Image block
const imageBlockSchema = blockMetadataSchema.extend({
  type: z.literal('image'),
  url: z.string().url(),
  alt: z.string().optional(),
  caption: z.string().optional(),
});

// Product block - embedded product card
const productBlockSchema = blockMetadataSchema.extend({
  type: z.literal('product'),
  productId: z.string(),
  productName: z.string(),
  productSlug: z.string(),
  productPrice: z.number(),
  productImage: z.string().optional(),
});

// Heading block - used for table of contents
const headingBlockSchema = blockMetadataSchema.extend({
  type: z.literal('heading'),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  content: z.string(),
});

// Quote block
const quoteBlockSchema = blockMetadataSchema.extend({
  type: z.literal('quote'),
  content: z.string(),
  author: z.string().optional(),
});

// Union of all block types
export const contentBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  imageBlockSchema,
  productBlockSchema,
  headingBlockSchema,
  quoteBlockSchema,
]);

export type ContentBlock = z.infer<typeof contentBlockSchema>;

// ============================================================================
// Table of Contents
// ============================================================================

export const tocItemSchema = z.object({
  id: z.string(),
  level: z.number(),
  text: z.string(),
});

export type TableOfContentsItem = z.infer<typeof tocItemSchema>;

// ============================================================================
// Blog Post Schemas
// ============================================================================

export const createBlogPostSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  subtitle: z.string().max(500).optional(),
  slug: z.string().min(1, 'Slug is required'),
  excerpt: z.string().optional(),
  content: z.string().optional(), // Legacy field
  contentBlocks: z.array(contentBlockSchema).optional(),
  tableOfContents: z.array(tocItemSchema).optional(), // Auto-generated
  featuredImageUrl: z.string().optional(),
  featuredImageAlt: z.string().optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  categoryId: z.string().optional(),
  categoryName: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
});

export const updateBlogPostSchema = createBlogPostSchema.partial();

export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>;
export type UpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>;

// ============================================================================
// Table of Contents Generator
// ============================================================================

export function generateTableOfContents(blocks: ContentBlock[]): TableOfContentsItem[] {
  return blocks
    .filter((block): block is z.infer<typeof headingBlockSchema> => block.type === 'heading')
    .map(block => ({
      id: block.anchorId || block.id,
      level: block.level,
      text: block.content,
    }));
}

// ============================================================================
// Bulk Sequence Update Schemas
// ============================================================================

export const bulkUpdateBlogSortOrderSchema = z.object({
  updates: z.array(z.object({
    blogId: z.string(),
    sortOrder: z.number().int().min(0),
  })).min(1),
});

export const updateSingleBlogSortOrderSchema = z.object({
  sortOrder: z.number().int().min(0),
});

export type BulkUpdateBlogSortOrderInput = z.infer<typeof bulkUpdateBlogSortOrderSchema>;
export type UpdateSingleBlogSortOrderInput = z.infer<typeof updateSingleBlogSortOrderSchema>;
