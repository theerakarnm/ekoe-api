/**
 * Customer Authentication Integration Tests
 * 
 * These tests verify the core authentication flows:
 * - Email/password registration
 * - Email/password login
 * - Session management
 * - Customer profile creation
 * 
 * Prerequisites:
 * - Database running with migrations applied
 * - Test environment configured
 * 
 * Run with: bun test
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { db } from '../core/database';
import { users, sessions, customerProfiles } from '../core/database/schema';
import { eq } from 'drizzle-orm';

// Test configuration
const TEST_USER_EMAIL = `contact@theerakarnm.dev`;
const TEST_USER_PASSWORD = 'TestPass123';
const TEST_USER_NAME = 'Test Customer';
const API_URL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';

let testUserId: string;
let testSessionToken: string;

describe('Customer Authentication Integration Tests', () => {

  // Cleanup after all tests
  afterAll(async () => {
    if (testUserId) {
      // Clean up test data
      await db.delete(sessions).where(eq(sessions.userId, testUserId));
      await db.delete(customerProfiles).where(eq(customerProfiles.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  describe('Test 18.1: Complete Registration Flow', () => {

    test('should register new customer with email/password', async () => {
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

      expect(response.ok).toBe(true);
      const data = await response.json() as any;

      // Verify response structure
      expect(data).toHaveProperty('user');
      expect(data.user.email).toBe(TEST_USER_EMAIL.toLowerCase());
      expect(data.user.name).toBe(TEST_USER_NAME);

      // Store user ID for cleanup
      testUserId = data.user.id;

      // Verify session cookie is set
      const cookies = response.headers.get('set-cookie');
      expect(cookies).toBeTruthy();
      expect(cookies).toContain('better-auth.session_token');
    });

    test('should create user record in database', async () => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, TEST_USER_EMAIL.toLowerCase()))
        .limit(1);

      expect(user).toBeTruthy();
      expect(user.email).toBe(TEST_USER_EMAIL.toLowerCase());
      expect(user.name).toBe(TEST_USER_NAME);
      expect(user.emailVerified).toBe(false); // Email not verified yet
    });

    test('should create customer profile in database', async () => {
      const [profile] = await db
        .select()
        .from(customerProfiles)
        .where(eq(customerProfiles.userId, testUserId))
        .limit(1);

      expect(profile).toBeTruthy();
      expect(profile.userId).toBe(testUserId);
      expect(profile.language).toBe('th'); // Default language
      expect(profile.totalOrders).toBe(0);
      expect(profile.totalSpent).toBe(0);
    });

    test('should not allow duplicate email registration', async () => {
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

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });

  describe('Test 18.1: Login Flow', () => {

    test('should login with correct credentials', async () => {
      const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json() as any;

      expect(data).toHaveProperty('user');
      expect(data.user.email).toBe(TEST_USER_EMAIL.toLowerCase());

      // Extract session token from cookies
      const cookies = response.headers.get('set-cookie');
      expect(cookies).toBeTruthy();

      // Store session token for subsequent tests
      const tokenMatch = cookies?.match(/better-auth\.session_token=([^;]+)/);
      if (tokenMatch) {
        testSessionToken = tokenMatch[1];
      }
    });

    test('should reject login with incorrect password', async () => {
      const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          password: 'WrongPassword123',
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    test('should reject login with non-existent email', async () => {
      const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: TEST_USER_PASSWORD,
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe('Test 18.5: Session Management', () => {

    test('should retrieve session with valid token', async () => {
      if (!testSessionToken) {
        throw new Error('No session token available. Login test may have failed.');
      }

      const response = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json() as any;

      expect(data).toHaveProperty('user');
      expect(data.user.id).toBe(testUserId);
      expect(data.user.email).toBe(TEST_USER_EMAIL.toLowerCase());
    });

    test('should create session record in database', async () => {
      const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, testUserId))
        .limit(1);

      expect(session).toBeTruthy();
      expect(session.userId).toBe(testUserId);
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    test('should reject invalid session token', async () => {
      const response = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': 'better-auth.session_token=invalid-token-12345',
        },
      });

      expect(response.ok).toBe(false);
    });

    test('should logout and invalidate session', async () => {
      if (!testSessionToken) {
        throw new Error('No session token available. Login test may have failed.');
      }

      const response = await fetch(`${API_URL}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response.ok).toBe(true);

      // Verify session is invalidated
      const sessionCheck = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(sessionCheck.ok).toBe(false);
    });
  });

  describe('Test 18.1: Protected Routes', () => {

    let newSessionToken: string;

    // Login again for protected route tests
    beforeAll(async () => {
      const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
        }),
      });

      const cookies = response.headers.get('set-cookie');
      const tokenMatch = cookies?.match(/better-auth\.session_token=([^;]+)/);
      if (tokenMatch) {
        newSessionToken = tokenMatch[1];
      }
    });

    test('should access customer profile endpoint when authenticated', async () => {
      const response = await fetch(`${API_URL}/api/customers/me`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${newSessionToken}`,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json() as any;

      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('userId');
      expect(data.data.userId).toBe(testUserId);
    });

    test('should reject customer profile endpoint when not authenticated', async () => {
      const response = await fetch(`${API_URL}/api/customers/me`, {
        method: 'GET',
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    test('should access customer addresses endpoint when authenticated', async () => {
      const response = await fetch(`${API_URL}/api/customers/me/addresses`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${newSessionToken}`,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json() as any;

      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });
});
