import { sql } from "drizzle-orm";
import { db } from "../src/core/database";

async function testConnection() {
  try {
    await db.execute(sql`SELECT 1`);
    console.log("Database connection successful");
    process.exit(0);
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
}

testConnection();