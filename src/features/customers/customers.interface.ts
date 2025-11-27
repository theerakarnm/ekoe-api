import { z } from 'zod';
import { type InferSelectModel } from 'drizzle-orm';
import { customerProfiles, customerAddresses } from '../../core/database/schema/customers.schema';
import { createSelectSchema } from 'drizzle-zod';

// Base Zod Schemas from Drizzle
export const selectCustomerProfileSchema = createSelectSchema(customerProfiles);
export const selectCustomerAddressSchema = createSelectSchema(customerAddresses);

// Customer Profile DTOs
export const createCustomerProfileSchema = z.object({
  userId: z.string(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().regex(/^[0-9+\-\s()]+$/, 'Invalid phone number format').max(20).optional(),
  dateOfBirth: z.coerce.date().optional(),
  newsletterSubscribed: z.boolean().default(false),
  smsSubscribed: z.boolean().default(false),
  language: z.enum(['th', 'en']).default('th'),
  notes: z.string().max(1000).optional(),
});

export const updateCustomerProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().regex(/^[0-9+\-\s()]+$/, 'Invalid phone number format').max(20).optional(),
  dateOfBirth: z.coerce.date().optional(),
  newsletterSubscribed: z.boolean().optional(),
  smsSubscribed: z.boolean().optional(),
  language: z.enum(['th', 'en']).optional(),
  notes: z.string().max(1000).optional(),
});

// Customer Address DTOs
export const createCustomerAddressSchema = z.object({
  userId: z.string(),
  label: z.string().max(50).optional(),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  company: z.string().max(200).optional(),
  addressLine1: z.string().min(1, 'Address line 1 is required').max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1, 'City is required').max(100),
  province: z.string().min(1, 'Province is required').max(100),
  postalCode: z.string().min(1, 'Postal code is required').regex(/^[0-9]{5}$/, 'Postal code must be 5 digits'),
  country: z.string().max(100).default('Thailand'),
  phone: z.string().min(1, 'Phone is required').regex(/^[0-9+\-\s()]+$/, 'Invalid phone number format').max(20),
  isDefault: z.boolean().default(false),
});

export const updateCustomerAddressSchema = z.object({
  label: z.string().max(50).optional(),
  firstName: z.string().min(1, 'First name is required').max(100).optional(),
  lastName: z.string().min(1, 'Last name is required').max(100).optional(),
  company: z.string().max(200).optional(),
  addressLine1: z.string().min(1, 'Address line 1 is required').max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1, 'City is required').max(100).optional(),
  province: z.string().min(1, 'Province is required').max(100).optional(),
  postalCode: z.string().min(1, 'Postal code is required').regex(/^[0-9]{5}$/, 'Postal code must be 5 digits').optional(),
  country: z.string().max(100).optional(),
  phone: z.string().min(1, 'Phone is required').regex(/^[0-9+\-\s()]+$/, 'Invalid phone number format').max(20).optional(),
  isDefault: z.boolean().optional(),
});

// Google Account Linking
export const linkGoogleAccountSchema = z.object({
  googleId: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  image: z.string().optional(),
});

// Types
export type CustomerProfile = InferSelectModel<typeof customerProfiles>;
export type CustomerAddress = InferSelectModel<typeof customerAddresses>;

export type CreateCustomerProfileDto = z.infer<typeof createCustomerProfileSchema>;
export type UpdateCustomerProfileDto = z.infer<typeof updateCustomerProfileSchema>;

export type CreateCustomerAddressDto = z.infer<typeof createCustomerAddressSchema>;
export type UpdateCustomerAddressDto = z.infer<typeof updateCustomerAddressSchema>;

export type LinkGoogleAccountDto = z.infer<typeof linkGoogleAccountSchema>;

// Response types
export interface CustomerProfileResponse {
  profile: CustomerProfile;
  addresses: CustomerAddress[];
}
