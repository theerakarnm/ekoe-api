import { z } from 'zod';

export const createCouponSchema = z.object({
  code: z.string().min(3, 'Code must be at least 3 characters').toUpperCase(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  discountType: z.enum(['percentage', 'fixed_amount', 'free_shipping']),
  discountValue: z.number().min(0, 'Value must be positive'),
  minPurchaseAmount: z.number().optional(),
  maxDiscountAmount: z.number().optional(),
  usageLimit: z.number().optional(),
  usageLimitPerCustomer: z.number().default(1),
  applicableToProducts: z.array(z.number()).optional(),
  applicableToCategories: z.array(z.number()).optional(),
  isActive: z.boolean().default(true),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional(),
});

export const updateCouponSchema = createCouponSchema.partial();

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
