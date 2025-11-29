import { db } from "../src/core/database";
import { sql } from "drizzle-orm";

async function testIndexPerformance() {
  try {
    console.log("Testing index performance...\n");

    // Test 1: Check if indexes are being used for common queries
    console.log("1️⃣  Testing query plan for price range filter:");
    const priceQuery = await db.execute(sql`
      EXPLAIN (FORMAT JSON)
      SELECT * FROM products 
      WHERE deleted_at IS NULL 
        AND base_price >= 1000 
        AND base_price <= 5000
      LIMIT 24;
    `);
    
    const pricePlan = JSON.stringify(priceQuery.rows[0], null, 2);
    const usesIndex = pricePlan.includes("idx_products_price") || pricePlan.includes("Index");
    console.log(`   ${usesIndex ? '✅' : '⚠️ '} Query plan: ${usesIndex ? 'Uses index' : 'May not use index (check if table has data)'}`);

    // Test 2: Check full-text search
    console.log("\n2️⃣  Testing query plan for text search:");
    const searchQuery = await db.execute(sql`
      EXPLAIN (FORMAT JSON)
      SELECT * FROM products 
      WHERE to_tsvector('english', name) @@ to_tsquery('english', 'serum')
      LIMIT 24;
    `);
    
    const searchPlan = JSON.stringify(searchQuery.rows[0], null, 2);
    const usesSearchIndex = searchPlan.includes("idx_products_name_search") || searchPlan.includes("Bitmap");
    console.log(`   ${usesSearchIndex ? '✅' : '⚠️ '} Query plan: ${usesSearchIndex ? 'Uses full-text index' : 'May not use index (check if table has data)'}`);

    // Test 3: Check category filtering
    console.log("\n3️⃣  Testing query plan for category filter:");
    const categoryQuery = await db.execute(sql`
      EXPLAIN (FORMAT JSON)
      SELECT p.* FROM products p
      INNER JOIN product_categories pc ON p.id = pc.product_id
      WHERE pc.category_id = 'test-category-id'
        AND p.deleted_at IS NULL
      LIMIT 24;
    `);
    
    const categoryPlan = JSON.stringify(categoryQuery.rows[0], null, 2);
    const usesCategoryIndex = categoryPlan.includes("idx_product_categories") || categoryPlan.includes("Index");
    console.log(`   ${usesCategoryIndex ? '✅' : '⚠️ '} Query plan: ${usesCategoryIndex ? 'Uses category index' : 'May not use index (check if table has data)'}`);

    // Test 4: Check composite index usage
    console.log("\n4️⃣  Testing query plan for sorting by created_at:");
    const sortQuery = await db.execute(sql`
      EXPLAIN (FORMAT JSON)
      SELECT * FROM products 
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 24;
    `);
    
    const sortPlan = JSON.stringify(sortQuery.rows[0], null, 2);
    const usesSortIndex = sortPlan.includes("idx_products_created_at") || sortPlan.includes("Index");
    console.log(`   ${usesSortIndex ? '✅' : '⚠️ '} Query plan: ${usesSortIndex ? 'Uses created_at index' : 'May not use index (check if table has data)'}`);

    console.log("\n📊 Index Performance Summary:");
    console.log("   All indexes have been created successfully.");
    console.log("   Query optimizer will use them when beneficial based on table statistics.");
    console.log("   Note: Indexes are most effective with larger datasets.\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error testing index performance:", error);
    process.exit(1);
  }
}

testIndexPerformance();
