import { z } from "zod";

// Payment Status enum
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

export type PaymentMethod = "promptpay" | "credit_card" | "bank_transfer";

// Payment interface
export interface Payment {
  id: string;
  orderId: string;
  paymentMethod: PaymentMethod;
  paymentProvider: string | null;
  amount: number;
  currency: string;
  transactionId: string | null;
  status: PaymentStatus;
  cardLast4: string | null;
  cardBrand: string | null;
  providerResponse: any;
  createdAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
}

// Create Payment Data
export interface CreatePaymentData {
  orderId: string;
  paymentMethod: PaymentMethod;
  paymentProvider?: string;
  amount: number;
  currency: string;
}

// Payment Status Response
export interface PaymentStatusResponse {
  paymentId: string;
  status: PaymentStatus;
  transactionId: string | null;
  amount: number;
  createdAt: Date;
  completedAt: Date | null;
}

// PromptPay Webhook Payload
export interface PromptPayWebhookPayload {
  transactionId: string;
  amount: number;
  currency?: string;
  status: string;
  referenceId: string;
  timestamp: string;
}

// 2C2P Webhook Payload
export interface TwoC2PWebhookPayload {
  version?: string;
  merchant_id: string;
  order_id: string;
  payment_status: string;
  transaction_ref: string;
  amount: string;
  currency: string;
  hash_value: string;
  card_number?: string;
  card_brand?: string;
}

// Zod validation schemas
export const createPromptPayPaymentSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.number().positive(),
});

export const create2C2PPaymentSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  returnUrl: z.string().url(),
});

export const getPaymentStatusSchema = z.object({
  id: z.string().uuid(),
});

export const manualVerifyPaymentSchema = z.object({
  note: z.string().optional(),
});
