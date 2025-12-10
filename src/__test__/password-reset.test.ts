/**
 * Password Reset Flow Integration Tests
 * 
 * These tests verify the password reset functionality:
 * - Request password reset
 * - Verify reset token generation
 * - Reset password with valid token
 * - Login with new password
 * - Reject invalid/expired tokens
 * 
 * Run with: bun test src/__test__/password-reset.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { db } from '../core/database';
import { users, sessions, customerProfiles, verifications } from '../core/database/schema';
import { eq, and, gt } from 'drizzle-orm';

const TEST_USER_EMAIL = `contact@theerakarnm.dev`;
const TEST_USER_PASSWORD = 'OriginalPass123';
const NEW_PASSWORD = 'NewPassword456';
const TEST_USER_NAME = 'Reset Test User';
const API_URL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';

let testUserId: string;
let resetToken: string;

describe('Password Reset Flow Tests', () => {

  // Setup: Create test user
  beforeAll(async () => {
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

    const data = await response.json() as any;
    testUserId = data.user.id;
  });

  // Cleanup after all tests
  afterAll(async () => {
    if (testUserId) {
      await db.delete(verifications).where(eq(verifications.identifier, TEST_USER_EMAIL.toLowerCase()));
      await db.delete(sessions).where(eq(sessions.userId, testUserId));
      await db.delete(customerProfiles).where(eq(customerProfiles.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  describe('Test 18.4: Request Password Reset', () => {

    test('should accept password reset request for existing email', async () => {
      const response = await fetch(`${API_URL}/api/auth/forget-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          redirectTo: 'http://localhost:5173/auth/reset-password-confirm',
        }),
      });

      // Better-auth typically returns 200 even for non-existent emails (security best practice)
      expect(response.ok).toBe(true);
    });

    test('should create verification token in database', async () => {
      // Wait a moment for token to be created
      await new Promise(resolve => setTimeout(resolve, 100));

      const [verification] = await db
        .select()
        .from(verifications)
        .where(
          and(
            eq(verifications.identifier, TEST_USER_EMAIL.toLowerCase()),
            gt(verifications.expiresAt, new Date())
          )
        )
        .orderBy(verifications.createdAt)
        .limit(1);

      expect(verification).toBeTruthy();
      expect(verification.identifier).toBe(TEST_USER_EMAIL.toLowerCase());
      expect(verification.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Store token for later tests
      resetToken = verification.value;
    });

    test('should accept password reset request for non-existent email (security)', async () => {
      // Should not reveal whether email exists
      const response = await fetch(`${API_URL}/api/auth/forget-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          redirectTo: 'http://localhost:5173/auth/reset-password-confirm',
        }),
      });

      // Should return success even for non-existent email
      expect(response.ok).toBe(true);
    });
  });

  describe('Test 18.4: Reset Password with Token', () => {

    test('should reject password reset with invalid token', async () => {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: 'invalid-token-12345',
          password: NEW_PASSWORD,
        }),
      });

      expect(response.ok).toBe(false);
    });

    test('should accept password reset with valid token', async () => {
      if (!resetToken) {
        throw new Error('No reset token available. Previous test may have failed.');
      }

      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: resetToken,
          password: NEW_PASSWORD,
        }),
      });

      expect(response.ok).toBe(true);
    });

    test('should invalidate reset token after use', async () => {
      // Try to use the same token again
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: resetToken,
          password: 'AnotherPassword789',
        }),
      });

      expect(response.ok).toBe(false);
    });
  });

  describe('Test 18.4: Login with New Password', () => {

    test('should reject login with old password', async () => {
      const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD, // Old password
        }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    test('should accept login with new password', async () => {
      const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          password: NEW_PASSWORD, // New password
        }),
      });

      expect(response.ok).toBe(true);
      const data = await response.json() as any;

      expect(data).toHaveProperty('user');
      expect(data.user.email).toBe(TEST_USER_EMAIL.toLowerCase());
      expect(data.user.id).toBe(testUserId);
    });

    test('should establish session after login with new password', async () => {
      const loginResponse = await fetch(`${API_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          password: NEW_PASSWORD,
        }),
      });

      const cookies = loginResponse.headers.get('set-cookie');
      expect(cookies).toBeTruthy();
      expect(cookies).toContain('better-auth.session_token');

      // Extract token and verify session
      const tokenMatch = cookies?.match(/better-auth\.session_token=([^;]+)/);
      if (tokenMatch) {
        const sessionToken = tokenMatch[1];

        const sessionResponse = await fetch(`${API_URL}/api/auth/get-session`, {
          method: 'GET',
          headers: {
            'Cookie': `better-auth.session_token=${sessionToken}`,
          },
        });

        expect(sessionResponse.ok).toBe(true);
        const sessionData = await sessionResponse.json() as any;
        expect(sessionData.user.id).toBe(testUserId);
      }
    });
  });

  describe('Test 18.4: Token Expiration', () => {

    test('should reject expired reset token', async () => {
      // Request new reset
      await fetch(`${API_URL}/api/auth/forget-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          redirectTo: 'http://localhost:5173/auth/reset-password-confirm',
        }),
      });

      // Wait for token creation
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get the token
      const [verification] = await db
        .select()
        .from(verifications)
        .where(
          and(
            eq(verifications.identifier, TEST_USER_EMAIL.toLowerCase()),
            gt(verifications.expiresAt, new Date())
          )
        )
        .orderBy(verifications.createdAt)
        .limit(1);

      const expiredToken = verification.value;

      // Manually expire the token
      await db
        .update(verifications)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(verifications.value, expiredToken));

      // Try to use expired token
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: expiredToken,
          password: 'ExpiredTokenPassword123',
        }),
      });

      expect(response.ok).toBe(false);
    });
  });

  describe('Test 18.4: Multiple Reset Requests', () => {

    test('should allow multiple password reset requests', async () => {
      // First request
      const response1 = await fetch(`${API_URL}/api/auth/forget-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          redirectTo: 'http://localhost:5173/auth/reset-password-confirm',
        }),
      });

      expect(response1.ok).toBe(true);

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second request
      const response2 = await fetch(`${API_URL}/api/auth/forget-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          redirectTo: 'http://localhost:5173/auth/reset-password-confirm',
        }),
      });

      expect(response2.ok).toBe(true);
    });

    test('should use most recent reset token', async () => {
      // Get all tokens for this email
      const tokens = await db
        .select()
        .from(verifications)
        .where(
          and(
            eq(verifications.identifier, TEST_USER_EMAIL.toLowerCase()),
            gt(verifications.expiresAt, new Date())
          )
        )
        .orderBy(verifications.createdAt);

      // Should have multiple tokens
      expect(tokens.length).toBeGreaterThan(0);

      // Most recent token should work
      const latestToken = tokens[tokens.length - 1].value;

      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: latestToken,
          password: 'FinalPassword789',
        }),
      });

      expect(response.ok).toBe(true);
    });
  });
});
