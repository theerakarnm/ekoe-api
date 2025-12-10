import { z } from "zod";

// Promotion types
export type PromotionType = 'percentage_discount' | 'fixed_discount' | 'free_gift';
export type PromotionStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'expired';
export type RuleType = 'condition' | 'benefit';
export type ConditionType = 'cart_value' | 'product_quantity' | 'specific_products' | 'category_products';
export type Operator = 'gte' | 'lte' | 'eq' | 'in' | 'not_in';
export type BenefitType = 'percentage_discount' | 'fixed_discount' | 'free_gift';

// Core promotion interface
export interface Promotion {
  id: string;
  name: string;
  description?: string;
  type: PromotionType;
  status: PromotionStatus;
  priority: number;
  startsAt: Date;
  endsAt: Date;
  usageLimit?: number;
  usageLimitPerCustomer: number;
  currentUsageCount: number;
  exclusiveWith?: string[];
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

// Promotion rule interface
export interface PromotionRule {
  id: string;
  promotionId: string;
  ruleType: RuleType;
  conditionType?: ConditionType;
  operator?: Operator;
  numericValue?: number;
  textValue?: string;
  jsonValue?: any;
  benefitType?: BenefitType;
  benefitValue?: number;
  maxDiscountAmount?: number;
  applicableProductIds?: string[];
  applicableCategoryIds?: string[];
  giftProductIds?: string[];
  giftQuantities?: number[];
  createdAt: Date;
}

// Promotion usage interface
export interface PromotionUsage {
  id: string;
  promotionId: string;
  orderId: string;
  customerId?: string;
  discountAmount: number;
  freeGifts?: FreeGift[];
  cartSubtotal: number;
  promotionSnapshot?: Promotion;
  createdAt: Date;
}

// Promotion analytics interface
export interface PromotionAnalytics {
  id: string;
  promotionId: string;
  date: string;
  hour?: number;
  views: number;
  applications: number;
  totalDiscountAmount: number;
  totalOrders: number;
  totalRevenue: number;
  conversionRate?: number;
  averageOrderValue?: number;
  createdAt: Date;
}

// Promotion evaluation context
export interface PromotionEvaluationContext {
  cartItems: CartItem[];
  cartSubtotal: number;
  customerId?: string;
  currentPromotions?: AppliedPromotion[];
}

// Cart item interface for evaluation
export interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  categoryIds?: string[];
}

// Applied promotion result
export interface AppliedPromotion {
  promotionId: string;
  promotionName: string;
  discountAmount: number;
  freeGifts: FreeGift[];
  appliedAt: Date;
}

// Free gift interface
export interface FreeGift {
  productId?: string;
  variantId?: string;
  quantity: number;
  name: string;
  imageUrl?: string;
  value: number;
}

// Promotion evaluation result
export interface PromotionEvaluationResult {
  eligiblePromotions: EligiblePromotion[];
  selectedPromotion?: AppliedPromotion;
  totalDiscount: number;
  freeGifts: FreeGift[];
  conflictResolution?: ConflictResolution;
}

// Eligible promotion interface
export interface EligiblePromotion {
  promotion: Promotion;
  rules: PromotionRule[];
  potentialDiscount: number;
  potentialGifts: FreeGift[];
  priority: number;
}

// Conflict resolution interface
export interface ConflictResolution {
  conflictType: 'priority' | 'exclusivity' | 'customer_benefit';
  selectedPromotionId: string;
  rejectedPromotionIds: string[];
  reason: string;
}

// Validation schemas
export const createPromotionSchema = z.object({
  name: z.string().min(1, "Promotion name is required").max(255),
  description: z.string().optional(),
  type: z.enum(['percentage_discount', 'fixed_discount', 'free_gift']),
  priority: z.number().int().min(0).default(0),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  usageLimit: z.number().int().positive().optional(),
  usageLimitPerCustomer: z.number().int().positive().default(1),
  exclusiveWith: z.array(z.string()).optional(),
});

export const updatePromotionSchema = createPromotionSchema.partial()

export const createPromotionRuleSchema = z.object({
  promotionId: z.string(),
  ruleType: z.enum(['condition', 'benefit']),
  conditionType: z.enum(['cart_value', 'product_quantity', 'specific_products', 'category_products']).optional(),
  operator: z.enum(['gte', 'lte', 'eq', 'in', 'not_in']).optional(),
  numericValue: z.number().optional(),
  textValue: z.string().optional(),
  jsonValue: z.any().optional(),
  benefitType: z.enum(['percentage_discount', 'fixed_discount', 'free_gift']).optional(),
  benefitValue: z.number().optional(),
  maxDiscountAmount: z.number().int().positive().optional(),
  applicableProductIds: z.array(z.string()).optional(),
  applicableCategoryIds: z.array(z.string()).optional(),
  giftProductIds: z.array(z.string()).optional(),
  giftQuantities: z.array(z.number().int().positive()).optional(),
});

export const promotionEvaluationContextSchema = z.object({
  cartItems: z.array(z.object({
    productId: z.string(),
    variantId: z.string().optional(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().int().positive(),
    subtotal: z.number().int().positive(),
    categoryIds: z.array(z.string()).optional(),
  })),
  cartSubtotal: z.number().int().positive(),
  customerId: z.string().optional(),
});

// DTOs for API responses
export interface CreatePromotionDto {
  name: string;
  description?: string;
  type: PromotionType;
  priority?: number;
  startsAt: string;
  endsAt: string;
  usageLimit?: number;
  usageLimitPerCustomer?: number;
  exclusiveWith?: string[];
}

export interface UpdatePromotionDto extends Partial<CreatePromotionDto> {
  id: string;
}

export interface PromotionListDto {
  id: string;
  name: string;
  type: PromotionType;
  status: PromotionStatus;
  startsAt: Date;
  endsAt: Date;
  currentUsageCount: number;
  usageLimit?: number;
  priority: number;
}

export interface PromotionDetailDto extends Promotion {
  rules: PromotionRule[];
  analytics?: PromotionAnalytics[];
}

export interface PromotionUsageStatsDto {
  totalUsage: number;
  totalDiscount: number;
  totalRevenue: number;
  conversionRate: number;
  averageOrderValue: number;
  topCustomers: Array<{
    customerId: string;
    usageCount: number;
    totalDiscount: number;
  }>;
}

// Error types
export class PromotionValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'PromotionValidationError';
  }
}

export class PromotionConflictError extends Error {
  constructor(message: string, public conflictingPromotions?: string[]) {
    super(message);
    this.name = 'PromotionConflictError';
  }
}

export class PromotionUsageLimitError extends Error {
  constructor(message: string, public promotionId?: string) {
    super(message);
    this.name = 'PromotionUsageLimitError';
  }
}

export class PromotionExpiredError extends Error {
  constructor(message: string, public promotionId?: string) {
    super(message);
    this.name = 'PromotionExpiredError';
  }
}