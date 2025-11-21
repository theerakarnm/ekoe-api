import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

import { config } from '../config';
import * as schema from './schema';

const pool = new Pool({
  connectionString: config.database.url,
});

export const db = drizzle(pool, { schema });

export const checkDbConnection = async () => {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};
