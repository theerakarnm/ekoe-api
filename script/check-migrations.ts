import { db } from "../src/core/database";
import { sql } from "drizzle-orm";

async function checkMigrations() {
  try {
    console.log("Checking applied migrations...\n");

    // Check if drizzle migrations table exists
    const tables = await db.execute(sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename = '__drizzle_migrations';
    `);

    if (tables.rows.length === 0) {
      console.log("❌ Drizzle migrations table not found!");
      process.exit(1);
    }

    // Get all applied migrations
    const migrations = await db.execute(sql`
      SELECT * FROM __drizzle_migrations
      ORDER BY created_at;
    `);

    console.log(`✅ Found ${migrations.rows.length} applied migrations:\n`);
    
    for (const row of migrations.rows) {
      console.log(`  📝 ${row.hash} - ${new Date(row.created_at).toISOString()}`);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error checking migrations:", error);
    process.exit(1);
  }
}

checkMigrations();
