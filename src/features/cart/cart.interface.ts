import { z } from 'zod';
import type { AppliedPromotion as PromotionAppliedPromotion } from '../promotions/promotions.interface';

// Cart item schema
export const cartItemSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  variantId: z.string().optional(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
});

// Validate cart request schema
export const validateCartSchema = z.object({
  items: z.array(cartItemSchema).min(1, 'At least one item is required'),
});

// Calculate cart request schema
export const calculateCartSchema = z.object({
  items: z.array(cartItemSchema).min(1, 'At least one item is required'),
  discountCode: z.string().optional(),
  shippingMethod: z.string().optional(),
});

// Validate discount code schema
export const validateDiscountSchema = z.object({
  code: z.string().min(1, 'Discount code is required'),
  subtotal: z.number().min(0, 'Subtotal must be non-negative'),
  items: z.array(cartItemSchema).optional(),
});

// Promotion evaluation schema
export const evaluatePromotionsSchema = z.object({
  items: z.array(cartItemSchema).min(1, 'At least one item is required'),
  customerId: z.string().optional(),
});

// Re-evaluate promotions schema
export const reEvaluatePromotionsSchema = z.object({
  items: z.array(cartItemSchema).min(1, 'At least one item is required'),
  customerId: z.string().optional(),
  currentPromotions: z.array(z.any()).optional(),
});

// Types
export type CartItemInput = z.infer<typeof cartItemSchema>;
export type ValidateCartRequest = z.infer<typeof validateCartSchema>;
export type CalculateCartRequest = z.infer<typeof calculateCartSchema>;
export type ValidateDiscountRequest = z.infer<typeof validateDiscountSchema>;

// Response types
export interface ComplimentaryGiftInfo {
  name: string;
  description: string;
  image: string;
  value: number;
}

export interface ValidatedCartItem {
  productId: string;
  variantId?: string;
  productName: string;
  variantName?: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  inStock: boolean;
  availableQuantity: number;
  sku?: string;
  image?: string;
  complimentaryGift?: ComplimentaryGiftInfo;
}

export interface CartValidationError {
  productId: string;
  variantId?: string;
  type: 'out_of_stock' | 'product_inactive' | 'product_not_found' | 'insufficient_stock';
  message: string;
}

export interface ValidatedCart {
  items: ValidatedCartItem[];
  subtotal: number;
  isValid: boolean;
  errors: CartValidationError[];
}

export interface FreeGift {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  value: number;
  minPurchaseAmount?: number;
  associatedProductIds?: string[];
}

export interface AppliedDiscount {
  code: string;
  type: 'percentage' | 'fixed_amount' | 'free_shipping';
  value: number;
  amount: number;
}

export interface CartPricing {
  subtotal: number;
  shippingCost: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  discount?: AppliedDiscount;
  freeGifts: FreeGift[];
  appliedPromotions?: PromotionAppliedPromotion[];
  promotionalDiscount?: number;
  promotionMessages?: PromotionMessage[];
}

export interface PromotionMessage {
  type: 'near_qualifying' | 'urgency' | 'benefit_explanation' | 'selection_reason';
  message: string;
  promotionId?: string;
  promotionName?: string;
  amountNeeded?: number;
  expiresAt?: Date;
  currentBenefit?: number;
  potentialBenefit?: number;
}

export interface NearQualifyingPromotion {
  promotionId: string;
  promotionName: string;
  amountNeeded: number;
  potentialDiscount: number;
  potentialGifts: FreeGift[];
  message: string;
}

export interface PromotionChangeResult {
  type: 'added' | 'removed' | 'updated';
  promotion: PromotionAppliedPromotion;
  previousPromotion?: PromotionAppliedPromotion;
  reason: string;
}

export interface DiscountValidation {
  isValid: boolean;
  code?: string;
  discountType?: 'percentage' | 'fixed_amount' | 'free_shipping';
  discountValue?: number;
  discountAmount?: number;
  error?: string;
  errorCode?: 'INVALID_CODE' | 'EXPIRED' | 'USAGE_LIMIT_REACHED' | 'MIN_PURCHASE_NOT_MET' | 'NOT_APPLICABLE' | 'NOT_STARTED' | 'LINKED_PRODUCTS_NOT_IN_CART';
}

export interface ShippingMethod {
  id: string;
  name: string;
  description: string;
  cost: number; // in cents
  estimatedDays: number;
  carrier?: string;
}
