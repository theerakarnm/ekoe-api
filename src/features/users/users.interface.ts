import { z } from 'zod';
import { type InferSelectModel } from 'drizzle-orm';
import { users } from '../../core/database/schema/auth-schema';
import { createSelectSchema } from 'drizzle-zod';

// Base Zod Schema
export const selectUserSchema = createSelectSchema(users);

// Manual DTO Schemas
export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  role: z.enum(['user', 'admin']).default('user'),
});

export const updateUserSchema = z.object({
  name: z.string().optional(),
  role: z.enum(['user', 'admin']).optional(),
});

// Types
export type User = InferSelectModel<typeof users>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
