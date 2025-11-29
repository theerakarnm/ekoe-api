import { db } from "../src/core/database";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";

async function applyIndexesMigration() {
  try {
    console.log("Applying product search indexes migration...\n");

    // Read the migration file
    const migrationPath = join(process.cwd(), "drizzle", "0002_add_product_search_indexes.sql");
    const migrationSQL = readFileSync(migrationPath, "utf-8");

    // Split by statement separator and execute each statement
    const statements = migrationSQL
      .split("-- ")
      .filter(s => s.trim())
      .map(s => s.trim());

    console.log(`Found ${statements.length} sections in migration file\n`);

    // Execute each CREATE INDEX statement
    const lines = migrationSQL.split("\n");
    const createIndexStatements: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("CREATE INDEX")) {
        createIndexStatements.push(trimmed.replace(/;$/, ""));
      }
    }

    console.log(`Executing ${createIndexStatements.length} CREATE INDEX statements...\n`);

    for (const statement of createIndexStatements) {
      try {
        await db.execute(sql.raw(statement));
        const indexName = statement.match(/idx_\w+/)?.[0] || "unknown";
        console.log(`  ✅ Created index: ${indexName}`);
      } catch (error: any) {
        if (error.message?.includes("already exists")) {
          const indexName = statement.match(/idx_\w+/)?.[0] || "unknown";
          console.log(`  ⚠️  Index already exists: ${indexName}`);
        } else {
          console.error(`  ❌ Error creating index: ${error.message}`);
          throw error;
        }
      }
    }

    console.log("\n🎉 Migration applied successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error applying migration:", error);
    process.exit(1);
  }
}

applyIndexesMigration();
