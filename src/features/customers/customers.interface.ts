import { z } from 'zod';
import { type InferSelectModel } from 'drizzle-orm';
import { customerProfiles, customerAddresses } from '../../core/database/schema/customers.schema';
import { createSelectSchema } from 'drizzle-zod';

// Base Zod Schemas from Drizzle
export const selectCustomerProfileSchema = createSelectSchema(customerProfiles);
export const selectCustomerAddressSchema = createSelectSchema(customerAddresses);

// Customer Profile DTOs
export const createCustomerProfileSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  firstName: z.string().min(1, 'First name is required').max(100, 'First name is too long').trim().optional(),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name is too long').trim().optional(),
  phone: z.string().regex(/^(\+?[1-9]\d{7,14}|0\d{8,10})$/, 'Invalid phone number format (use international format or local format with leading 0)').optional(),
  dateOfBirth: z.coerce.date().max(new Date(), 'Date of birth cannot be in the future').optional(),
  newsletterSubscribed: z.boolean().default(false),
  smsSubscribed: z.boolean().default(false),
  language: z.enum(['th', 'en']).default('th'),
  notes: z.string().max(1000, 'Notes are too long').optional(),
});

export const updateCustomerProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100, 'First name is too long').trim().optional(),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name is too long').trim().optional(),
  phone: z.string().regex(/^(\+?[1-9]\d{7,14}|0\d{8,10})$/, 'Invalid phone number format (use international format or local format with leading 0)').optional(),
  dateOfBirth: z.coerce.date().max(new Date(), 'Date of birth cannot be in the future').optional(),
  newsletterSubscribed: z.boolean().optional(),
  smsSubscribed: z.boolean().optional(),
  language: z.enum(['th', 'en']).optional(),
  notes: z.string().max(1000, 'Notes are too long').optional(),
});

// Customer Address DTOs
export const createCustomerAddressSchema = z.object({
  label: z.string().max(50, 'Label is too long').trim().optional(),
  firstName: z.string().min(1, 'First name is required').max(100, 'First name is too long').trim(),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name is too long').trim(),
  company: z.string().max(200, 'Company name is too long').trim().optional(),
  addressLine1: z.string().min(1, 'Address line 1 is required').max(200, 'Address is too long').trim(),
  addressLine2: z.string().max(200, 'Address is too long').trim().optional(),
  city: z.string().min(1, 'City is required').max(100, 'City name is too long').trim(),
  province: z.string().min(1, 'Province is required').max(100, 'Province name is too long').trim(),
  postalCode: z.string().min(1, 'Postal code is required').regex(/^[0-9]{5}$/, 'Postal code must be 5 digits'),
  country: z.string().max(100, 'Country name is too long').default('Thailand'),
  phone: z.string().min(1, 'Phone is required').regex(/^(\+?[1-9]\d{7,14}|0\d{8,10})$/, 'Invalid phone number format (use international format or local format with leading 0)'),
  isDefault: z.boolean().default(false),
});

export const updateCustomerAddressSchema = z.object({
  label: z.string().max(50, 'Label is too long').trim().optional(),
  firstName: z.string().min(1, 'First name is required').max(100, 'First name is too long').trim().optional(),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name is too long').trim().optional(),
  company: z.string().max(200, 'Company name is too long').trim().optional(),
  addressLine1: z.string().min(1, 'Address line 1 is required').max(200, 'Address is too long').trim().optional(),
  addressLine2: z.string().max(200, 'Address is too long').trim().optional(),
  city: z.string().min(1, 'City is required').max(100, 'City name is too long').trim().optional(),
  province: z.string().min(1, 'Province is required').max(100, 'Province name is too long').trim().optional(),
  postalCode: z.string().min(1, 'Postal code is required').regex(/^[0-9]{5}$/, 'Postal code must be 5 digits').optional(),
  country: z.string().max(100, 'Country name is too long').optional(),
  phone: z.string().min(1, 'Phone is required').regex(/^(\+?[1-9]\d{7,14}|0\d{8,10})$/, 'Invalid phone number format (use international format)').optional(),
  isDefault: z.boolean().optional(),
});

// Google Account Linking
export const linkGoogleAccountSchema = z.object({
  googleId: z.string().min(1, 'Google ID is required'),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  name: z.string().max(200, 'Name is too long').trim().optional(),
  image: z.string().url('Invalid image URL').optional(),
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
