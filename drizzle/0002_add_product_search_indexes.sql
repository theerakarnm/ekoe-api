-- Add indexes for product search and filtering performance

-- Index for filtering by status and deleted_at (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_products_status_deleted ON products(status, deleted_at);

-- Index for filtering by price (for price range queries)
CREATE INDEX IF NOT EXISTS idx_products_price ON products(base_price) WHERE deleted_at IS NULL;

-- Index for sorting by created_at (for newest/oldest sorting)
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC) WHERE deleted_at IS NULL;

-- Index for featured products
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured) WHERE deleted_at IS NULL AND status = 'active';

-- Full-text search index on product name
CREATE INDEX IF NOT EXISTS idx_products_name_search ON products USING gin(to_tsvector('english', name));

-- Full-text search index on product description
CREATE INDEX IF NOT EXISTS idx_products_description_search ON products USING gin(to_tsvector('english', COALESCE(description, '')));

-- Index for product-category relationship (for category filtering)
CREATE INDEX IF NOT EXISTS idx_product_categories_category_id ON product_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_product_id ON product_categories(product_id);

-- Composite index for category filtering with product status
CREATE INDEX IF NOT EXISTS idx_product_categories_composite ON product_categories(category_id, product_id);

-- Index for product tags (for tag-based filtering)
CREATE INDEX IF NOT EXISTS idx_product_tags_tag_id ON product_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_product_tags_product_id ON product_tags(product_id);

-- Index for active categories
CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active, slug);

-- Index for product variants by product
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id) WHERE is_active = true;

-- Index for product images by product
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id, sort_order);
