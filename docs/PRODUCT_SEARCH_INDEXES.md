# Product Search and Filtering Indexes

This document describes the database indexes added to optimize product search and filtering performance.

## Overview

Migration `0002_add_product_search_indexes.sql` adds 14 indexes to improve query performance for the product discovery feature.

## Indexes Created

### Products Table

1. **idx_products_status_deleted** - Composite index on `(status, deleted_at)`
   - Optimizes filtering by product status and soft-delete checks
   - Most common query pattern

2. **idx_products_price** - Index on `base_price` WHERE `deleted_at IS NULL`
   - Optimizes price range filtering
   - Partial index excludes deleted products

3. **idx_products_created_at** - Index on `created_at DESC` WHERE `deleted_at IS NULL`
   - Optimizes sorting by newest/oldest products
   - Partial index excludes deleted products

4. **idx_products_featured** - Index on `featured` WHERE `deleted_at IS NULL AND status = 'active'`
   - Optimizes queries for featured products
   - Partial index for active, non-deleted products only

5. **idx_products_name_search** - GIN index on `to_tsvector('english', name)`
   - Full-text search on product names
   - Uses PostgreSQL's built-in text search

6. **idx_products_description_search** - GIN index on `to_tsvector('english', COALESCE(description, ''))`
   - Full-text search on product descriptions
   - Handles NULL descriptions gracefully

### Product Categories Table

7. **idx_product_categories_category_id** - Index on `category_id`
   - Optimizes filtering products by category

8. **idx_product_categories_product_id** - Index on `product_id`
   - Optimizes reverse lookups (finding categories for a product)

9. **idx_product_categories_composite** - Composite index on `(category_id, product_id)`
   - Optimizes JOIN operations between products and categories

### Product Tags Table

10. **idx_product_tags_tag_id** - Index on `tag_id`
    - Optimizes filtering products by tag

11. **idx_product_tags_product_id** - Index on `product_id`
    - Optimizes reverse lookups (finding tags for a product)

### Categories Table

12. **idx_categories_active** - Composite index on `(is_active, slug)`
    - Optimizes fetching active categories
    - Includes slug for efficient lookups

### Product Variants Table

13. **idx_product_variants_product_id** - Index on `product_id` WHERE `is_active = true`
    - Optimizes fetching variants for a product
    - Partial index for active variants only

### Product Images Table

14. **idx_product_images_product_id** - Composite index on `(product_id, sort_order)`
    - Optimizes fetching images for a product in display order

## Query Patterns Optimized

### Search Query
```sql
SELECT * FROM products 
WHERE to_tsvector('english', name) @@ to_tsquery('english', 'search_term')
  AND deleted_at IS NULL;
```
Uses: `idx_products_name_search`

### Price Range Filter
```sql
SELECT * FROM products 
WHERE base_price >= 1000 
  AND base_price <= 5000
  AND deleted_at IS NULL;
```
Uses: `idx_products_price`

### Category Filter
```sql
SELECT p.* FROM products p
INNER JOIN product_categories pc ON p.id = pc.product_id
WHERE pc.category_id IN ('cat1', 'cat2')
  AND p.deleted_at IS NULL;
```
Uses: `idx_product_categories_composite`, `idx_products_status_deleted`

### Combined Filters with Sorting
```sql
SELECT p.* FROM products p
INNER JOIN product_categories pc ON p.id = pc.product_id
WHERE pc.category_id = 'cat1'
  AND p.base_price >= 1000
  AND p.deleted_at IS NULL
ORDER BY p.created_at DESC
LIMIT 24;
```
Uses: Multiple indexes - `idx_product_categories_composite`, `idx_products_price`, `idx_products_created_at`

## Performance Considerations

1. **Partial Indexes**: Several indexes use `WHERE` clauses to index only relevant rows (e.g., non-deleted products), reducing index size and improving performance.

2. **Full-Text Search**: GIN indexes on text fields enable fast full-text search without LIKE queries.

3. **Composite Indexes**: Multi-column indexes optimize queries that filter or join on multiple columns.

4. **Index Selectivity**: The query optimizer will choose the most selective index based on table statistics.

## Maintenance

- Indexes are automatically maintained by PostgreSQL
- Run `ANALYZE products;` after bulk data imports to update statistics
- Monitor index usage with: `SELECT * FROM pg_stat_user_indexes WHERE schemaname = 'public';`

## Verification

Run the verification script to check all indexes are present:
```bash
bun run script/verify-indexes.ts
```

Run the performance test to see query plans:
```bash
bun run script/test-index-performance.ts
```
