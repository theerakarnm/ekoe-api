/**
 * Checkout Authentication Integration Tests
 * 
 * These tests verify the checkout authentication flow:
 * - Unauthenticated users are redirected to login
 * - Cart state is preserved through authentication
 * - Authenticated users can access checkout
 * - Profile data is available for pre-fill
 * 
 * Note: This tests the API side. Web-side cart preservation
 * and redirect logic should be tested manually or with E2E tests.
 * 
 * Run with: bun test src/__test__/checkout-auth.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { db } from '../core/database';
import { users, sessions, customerProfiles, customerAddresses } from '../core/database/schema';
import { eq } from 'drizzle-orm';

const TEST_USER_EMAIL = `checkout-test-${Date.now()}@example.com`;
const TEST_USER_PASSWORD = 'CheckoutTest123';
const TEST_USER_NAME = 'Checkout Test User';
const API_URL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';

let testUserId: string;
let testSessionToken: string;
let testAddressId: string;

describe('Checkout Authentication Tests', () => {
  
  // Setup: Create test user
  beforeAll(async () => {
    // Register user
    const response = await fetch(`${API_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
        name: TEST_USER_NAME,
      }),
    });

    const data = await response.json();
    testUserId = data.user.id;

    // Login to get session token
    const loginResponse = await fetch(`${API_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
      }),
    });

    const cookies = loginResponse.headers.get('set-cookie');
    const tokenMatch = cookies?.match(/better-auth\.session_token=([^;]+)/);
    if (tokenMatch) {
      testSessionToken = tokenMatch[1];
    }

    // Create test address for pre-fill testing
    const addressResponse = await fetch(`${API_URL}/api/customers/me/addresses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `better-auth.session_token=${testSessionToken}`,
      },
      body: JSON.stringify({
        label: 'Home',
        firstName: 'Checkout',
        lastName: 'Test',
        addressLine1: '123 Test Street',
        city: 'Bangkok',
        province: 'Bangkok',
        postalCode: '10110',
        country: 'TH',
        phone: '0812345678',
        isDefault: true,
      }),
    });

    const addressData = await addressResponse.json();
    testAddressId = addressData.data.id;
  });

  // Cleanup after all tests
  afterAll(async () => {
    if (testUserId) {
      await db.delete(customerAddresses).where(eq(customerAddresses.userId, testUserId));
      await db.delete(sessions).where(eq(sessions.userId, testUserId));
      await db.delete(customerProfiles).where(eq(customerProfiles.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  describe('Test 18.3: Checkout Authentication Requirements', () => {
    
    test('should reject unauthenticated access to customer profile', async () => {
      const response = await fetch(`${API_URL}/api/customers/me`, {
        method: 'GET',
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBeTruthy();
    });

    test('should reject unauthenticated access to customer addresses', async () => {
      const response = await fetch(`${API_URL}/api/customers/me/addresses`, {
        method: 'GET',
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    test('should allow authenticated access to customer profile', async () => {
      const response = await fetch(`${API_URL}/api/customers/me`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('userId');
      expect(data.data.userId).toBe(testUserId);
    });

    test('should allow authenticated access to customer addresses', async () => {
      const response = await fetch(`${API_URL}/api/customers/me/addresses`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
    });
  });

  describe('Test 18.3: Profile Data for Pre-fill', () => {
    
    test('should retrieve customer profile with name and contact info', async () => {
      const response = await fetch(`${API_URL}/api/customers/me`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      
      // Verify profile data is available for checkout pre-fill
      expect(data.data).toHaveProperty('userId');
      expect(data.data).toHaveProperty('firstName');
      expect(data.data).toHaveProperty('lastName');
      expect(data.data).toHaveProperty('phone');
    });

    test('should retrieve saved addresses for checkout', async () => {
      const response = await fetch(`${API_URL}/api/customers/me/addresses`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      
      // Verify addresses are available
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
      
      // Verify address structure
      const address = data.data[0];
      expect(address).toHaveProperty('firstName');
      expect(address).toHaveProperty('lastName');
      expect(address).toHaveProperty('addressLine1');
      expect(address).toHaveProperty('city');
      expect(address).toHaveProperty('province');
      expect(address).toHaveProperty('postalCode');
      expect(address).toHaveProperty('phone');
      expect(address).toHaveProperty('isDefault');
    });

    test('should identify default address for checkout', async () => {
      const response = await fetch(`${API_URL}/api/customers/me/addresses`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      const data = await response.json();
      const defaultAddress = data.data.find((addr: any) => addr.isDefault);
      
      expect(defaultAddress).toBeTruthy();
      expect(defaultAddress.isDefault).toBe(true);
    });
  });

  describe('Test 18.3: Session Validation', () => {
    
    test('should validate session before allowing checkout', async () => {
      // Valid session
      const validResponse = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(validResponse.ok).toBe(true);
      const validData = await validResponse.json();
      expect(validData.user.id).toBe(testUserId);
    });

    test('should reject invalid session token', async () => {
      const response = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': 'better-auth.session_token=invalid-token',
        },
      });

      expect(response.ok).toBe(false);
    });

    test('should reject expired session', async () => {
      // Manually expire the session
      await db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(sessions.userId, testUserId));

      const response = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response.ok).toBe(false);

      // Restore session for other tests
      await db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) })
        .where(eq(sessions.userId, testUserId));
    });
  });

  describe('Test 18.3: Order Creation (Checkout Completion)', () => {
    
    test('should allow authenticated user to create order', async () => {
      // Note: This assumes orders endpoint exists and requires authentication
      // Adjust based on actual implementation
      const response = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
        body: JSON.stringify({
          items: [
            {
              productId: 'test-product-id',
              variantId: 'test-variant-id',
              quantity: 1,
              price: 100,
            },
          ],
          shippingAddressId: testAddressId,
          billingAddressId: testAddressId,
          paymentMethod: 'credit_card',
          shippingMethod: 'standard',
        }),
      });

      // Order creation might fail due to invalid product IDs, but should not fail due to auth
      // We're testing that authentication is checked, not that order creation succeeds
      if (response.status === 401) {
        throw new Error('Order creation failed due to authentication - this should not happen');
      }
      
      // Any other status (400, 404, 200, etc.) means auth passed
      expect(response.status).not.toBe(401);
    });

    test('should reject unauthenticated order creation', async () => {
      const response = await fetch(`${API_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              productId: 'test-product-id',
              variantId: 'test-variant-id',
              quantity: 1,
              price: 100,
            },
          ],
        }),
      });

      expect(response.status).toBe(401);
    });
  });
});
