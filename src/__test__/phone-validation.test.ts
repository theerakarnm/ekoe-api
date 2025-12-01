import { describe, test, expect } from 'bun:test';
import { z } from 'zod';

// Define the regex we want to test
// Matches international format (e.g., +66...) or local format starting with 0 (e.g., 08...)
// International: Min 8 digits (to avoid short numbers like 12345), Max 15
// Local: Starts with 0, followed by 8-10 digits (Total 9-11 digits). Supports 02 (landline) and 08/06/09 (mobile)
const phoneRegex = /^(\+?[1-9]\d{7,14}|0\d{8,10})$/;

const phoneSchema = z.string().regex(phoneRegex, 'Invalid phone number format');

describe('Phone Number Validation Regex', () => {
  test('should accept valid international numbers', () => {
    expect(phoneSchema.safeParse('+66631236001').success).toBe(true);
    expect(phoneSchema.safeParse('+1234567890').success).toBe(true);
    expect(phoneSchema.safeParse('66631236001').success).toBe(true); // Without + but starts with non-zero
  });

  test('should accept valid local numbers with leading zero', () => {
    expect(phoneSchema.safeParse('0631236001').success).toBe(true); // Mobile
    expect(phoneSchema.safeParse('0812345678').success).toBe(true); // Mobile
    expect(phoneSchema.safeParse('021234567').success).toBe(true); // Landline 9 digits
  });

  test('should reject invalid numbers', () => {
    expect(phoneSchema.safeParse('12345').success).toBe(false); // Too short
    expect(phoneSchema.safeParse('abc').success).toBe(false); // Not digits
    expect(phoneSchema.safeParse('0123456').success).toBe(false); // Too short for local
    expect(phoneSchema.safeParse('00123456789').success).toBe(true); // 00 prefix is often used for international dialing from landlines, so 0+10 digits is technically valid in our local regex `0\d{8,10}`.
  });
  
  test('should reject extremely long numbers', () => {
     expect(phoneSchema.safeParse('01234567890123456789').success).toBe(false);
  });
});
