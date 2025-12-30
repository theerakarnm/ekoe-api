-- Add sort_order column to blog_posts table for admin-controlled display ordering
ALTER TABLE "blog_posts" ADD COLUMN "sort_order" integer DEFAULT 0;

-- Create index for efficient ordering queries
CREATE INDEX IF NOT EXISTS "idx_blog_posts_sort_order" ON "blog_posts" ("sort_order");
