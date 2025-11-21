import { z } from 'zod';

export const createBlogPostSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z.string().min(1, 'Slug is required'),
  excerpt: z.string().optional(),
  content: z.string().optional(),
  featuredImageUrl: z.string().optional(),
  featuredImageAlt: z.string().optional(),
  authorId: z.number().optional(),
  authorName: z.string().optional(),
  categoryId: z.number().optional(),
  categoryName: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
});

export const updateBlogPostSchema = createBlogPostSchema.partial();

export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>;
export type UpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>;
