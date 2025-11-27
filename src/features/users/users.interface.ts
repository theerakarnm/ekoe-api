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

// Customer query parameters
export const getCustomersParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

// Types
export type User = InferSelectModel<typeof users>;
export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type GetCustomersParams = z.infer<typeof getCustomersParamsSchema>;

// Customer with statistics
export interface CustomerWithStats {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string | null;
  createdAt: Date;
  orderCount: number;
  totalSpent: number;
}

// Customer detail with order history
export interface CustomerDetail extends User {
  orderCount: number;
  totalSpent: number;
  orders: Array<{
    id: string;
    orderNumber: string;
    email: string;
    status: string;
    paymentStatus: string;
    fulfillmentStatus: string | null;
    subtotal: number;
    shippingCost: number | null;
    taxAmount: number | null;
    discountAmount: number | null;
    totalAmount: number;
    currency: string | null;
    createdAt: Date;
    paidAt: Date | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
  }>;
}
