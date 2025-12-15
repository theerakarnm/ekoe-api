-- Add sort_order column to products table for admin-controlled display ordering
ALTER TABLE "products" ADD COLUMN "sort_order" integer DEFAULT 0;

-- Create index for efficient ordering queries
CREATE INDEX IF NOT EXISTS "idx_products_sort_order" ON "products" ("sort_order");
