import { db } from "../src/core/database";
import { sql } from "drizzle-orm";

async function verifyIndexes() {
  try {
    console.log("Checking product-related indexes...\n");

    const indexes = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename IN ('products', 'product_categories', 'product_tags', 'categories', 'product_variants', 'product_images')
        AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname;
    `);

    if (indexes.rows.length === 0) {
      console.log("❌ No custom indexes found!");
      process.exit(1);
    }

    console.log(`✅ Found ${indexes.rows.length} custom indexes:\n`);
    
    const expectedIndexes = [
      'idx_products_status_deleted',
      'idx_products_price',
      'idx_products_created_at',
      'idx_products_featured',
      'idx_products_name_search',
      'idx_products_description_search',
      'idx_product_categories_category_id',
      'idx_product_categories_product_id',
      'idx_product_categories_composite',
      'idx_product_tags_tag_id',
      'idx_product_tags_product_id',
      'idx_categories_active',
      'idx_product_variants_product_id',
      'idx_product_images_product_id'
    ];

    const foundIndexes = indexes.rows.map((row: any) => row.indexname);
    
    for (const row of indexes.rows) {
      console.log(`  📊 ${row.tablename}.${row.indexname}`);
    }

    console.log("\n✅ Verifying expected indexes:");
    let allFound = true;
    for (const expectedIndex of expectedIndexes) {
      const found = foundIndexes.includes(expectedIndex);
      console.log(`  ${found ? '✅' : '❌'} ${expectedIndex}`);
      if (!found) allFound = false;
    }

    if (allFound) {
      console.log("\n🎉 All expected indexes are present!");
    } else {
      console.log("\n⚠️  Some expected indexes are missing!");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error verifying indexes:", error);
    process.exit(1);
  }
}

verifyIndexes();
