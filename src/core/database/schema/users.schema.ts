import { pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { commonColumns } from '../types';
import { roleEnum } from '../db.enum';

export const users = pgTable('users', {
  ...commonColumns,
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: text('password').notNull(),
  name: varchar('name', { length: 255 }),
  role: roleEnum('role').default('user').notNull(),
});
