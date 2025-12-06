import { db } from './src/core/database/index.ts';
import { products } from './src/core/database/schema/products.schema.ts';
import { isNull } from 'drizzle-orm';

const result = await db.select().from(products).where(isNull(products.deletedAt)).limit(5);
console.log(JSON.stringify(result, null, 2));
process.exit(0);
