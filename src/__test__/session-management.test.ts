/**
 * Session Management Integration Tests
 * 
 * These tests verify session management functionality:
 * - Session creation on login
 * - Session persistence
 * - Session validation
 * - Session expiration
 * - Logout and session cleanup
 * 
 * Run with: bun test src/__test__/session-management.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { db } from '../core/database';
import { users, sessions, customerProfiles } from '../core/database/schema';
import { eq } from 'drizzle-orm';

const TEST_USER_EMAIL = `session-test-${Date.now()}@example.com`;
const TEST_USER_PASSWORD = 'SessionTest123';
const TEST_USER_NAME = 'Session Test User';
const API_URL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';

let testUserId: string;
let testSessionToken: string;

describe('Session Management Tests', () => {
  
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

    const data = await response.json();
    testUserId = data.user.id;
  });

  // Cleanup after all tests
  afterAll(async () => {
    if (testUserId) {
      await db.delete(sessions).where(eq(sessions.userId, testUserId));
      await db.delete(customerProfiles).where(eq(customerProfiles.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  describe('Test 18.5: Session Creation', () => {
    
    test('should create session on successful login', async () => {
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
      
      // Verify session cookie is set
      const cookies = response.headers.get('set-cookie');
      expect(cookies).toBeTruthy();
      expect(cookies).toContain('better-auth.session_token');
      
      // Extract session token
      const tokenMatch = cookies?.match(/better-auth\.session_token=([^;]+)/);
      if (tokenMatch) {
        testSessionToken = tokenMatch[1];
      }
      
      expect(testSessionToken).toBeTruthy();
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
      
      // Verify session expires in approximately 7 days
      const sevenDaysFromNow = Date.now() + (7 * 24 * 60 * 60 * 1000);
      const oneDayTolerance = 24 * 60 * 60 * 1000;
      expect(session.expiresAt.getTime()).toBeGreaterThan(sevenDaysFromNow - oneDayTolerance);
      expect(session.expiresAt.getTime()).toBeLessThan(sevenDaysFromNow + oneDayTolerance);
    });

    test('should set secure cookie attributes', async () => {
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
      expect(cookies).toBeTruthy();
      
      // Verify cookie attributes
      expect(cookies).toContain('HttpOnly'); // Prevents XSS
      expect(cookies).toContain('SameSite=None'); // Cross-origin support
      expect(cookies).toContain('Path=/'); // Available site-wide
      
      // Note: Secure flag depends on environment (production vs development)
      // In production, should contain 'Secure'
    });
  });

  describe('Test 18.5: Session Persistence', () => {
    
    test('should retrieve session with valid token', async () => {
      const response = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      
      expect(data).toHaveProperty('user');
      expect(data.user.id).toBe(testUserId);
      expect(data.user.email).toBe(TEST_USER_EMAIL.toLowerCase());
    });

    test('should maintain session across multiple requests', async () => {
      // First request
      const response1 = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response1.ok).toBe(true);

      // Second request with same token
      const response2 = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response2.ok).toBe(true);
      
      // Both should return same user
      const data1 = await response1.json();
      const data2 = await response2.json();
      expect(data1.user.id).toBe(data2.user.id);
    });

    test('should allow access to protected routes with valid session', async () => {
      const response = await fetch(`${API_URL}/api/customers/me`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.userId).toBe(testUserId);
    });
  });

  describe('Test 18.5: Session Validation', () => {
    
    test('should reject invalid session token', async () => {
      const response = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': 'better-auth.session_token=invalid-token-12345',
        },
      });

      expect(response.ok).toBe(false);
    });

    test('should reject missing session token', async () => {
      const response = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
      });

      expect(response.ok).toBe(false);
    });

    test('should reject malformed session token', async () => {
      const response = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': 'better-auth.session_token=',
        },
      });

      expect(response.ok).toBe(false);
    });

    test('should block protected routes with invalid session', async () => {
      const response = await fetch(`${API_URL}/api/customers/me`, {
        method: 'GET',
        headers: {
          'Cookie': 'better-auth.session_token=invalid-token',
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe('Test 18.5: Session Expiration', () => {
    
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
    });

    test('should block protected routes with expired session', async () => {
      // Session is already expired from previous test
      const response = await fetch(`${API_URL}/api/customers/me`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    test('should allow new login after session expiration', async () => {
      // Login again to create new session
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
      
      // Extract new session token
      const cookies = response.headers.get('set-cookie');
      const tokenMatch = cookies?.match(/better-auth\.session_token=([^;]+)/);
      if (tokenMatch) {
        testSessionToken = tokenMatch[1];
      }
      
      // Verify new session works
      const sessionResponse = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(sessionResponse.ok).toBe(true);
    });
  });

  describe('Test 18.5: Logout and Session Cleanup', () => {
    
    test('should logout and invalidate session', async () => {
      const response = await fetch(`${API_URL}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response.ok).toBe(true);
    });

    test('should reject session after logout', async () => {
      const response = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response.ok).toBe(false);
    });

    test('should clear session cookie on logout', async () => {
      // Login to get a fresh session
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

      const loginCookies = loginResponse.headers.get('set-cookie');
      const tokenMatch = loginCookies?.match(/better-auth\.session_token=([^;]+)/);
      const freshToken = tokenMatch?.[1];

      // Logout
      const logoutResponse = await fetch(`${API_URL}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          'Cookie': `better-auth.session_token=${freshToken}`,
        },
      });

      const logoutCookies = logoutResponse.headers.get('set-cookie');
      
      // Cookie should be cleared (set to empty or with Max-Age=0)
      expect(logoutCookies).toBeTruthy();
      // Better-auth typically sets the cookie to empty or with Max-Age=0
    });

    test('should block protected routes after logout', async () => {
      const response = await fetch(`${API_URL}/api/customers/me`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${testSessionToken}`,
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    test('should allow new login after logout', async () => {
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
      const data = await response.json();
      expect(data.user.id).toBe(testUserId);
    });
  });

  describe('Test 18.5: Multiple Sessions', () => {
    
    test('should allow multiple concurrent sessions', async () => {
      // Login from "first device"
      const response1 = await fetch(`${API_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
        }),
      });

      const cookies1 = response1.headers.get('set-cookie');
      const token1 = cookies1?.match(/better-auth\.session_token=([^;]+)/)?.[1];

      // Login from "second device"
      const response2 = await fetch(`${API_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
        }),
      });

      const cookies2 = response2.headers.get('set-cookie');
      const token2 = cookies2?.match(/better-auth\.session_token=([^;]+)/)?.[1];

      // Both sessions should be valid
      expect(token1).toBeTruthy();
      expect(token2).toBeTruthy();
      expect(token1).not.toBe(token2);

      // Verify both sessions work
      const session1Check = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${token1}`,
        },
      });

      const session2Check = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${token2}`,
        },
      });

      expect(session1Check.ok).toBe(true);
      expect(session2Check.ok).toBe(true);
    });

    test('should invalidate only specific session on logout', async () => {
      // Create two sessions
      const login1 = await fetch(`${API_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
        }),
      });

      const token1 = login1.headers.get('set-cookie')?.match(/better-auth\.session_token=([^;]+)/)?.[1];

      const login2 = await fetch(`${API_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: TEST_USER_EMAIL,
          password: TEST_USER_PASSWORD,
        }),
      });

      const token2 = login2.headers.get('set-cookie')?.match(/better-auth\.session_token=([^;]+)/)?.[1];

      // Logout from first session
      await fetch(`${API_URL}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          'Cookie': `better-auth.session_token=${token1}`,
        },
      });

      // First session should be invalid
      const check1 = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${token1}`,
        },
      });

      expect(check1.ok).toBe(false);

      // Second session should still be valid
      const check2 = await fetch(`${API_URL}/api/auth/get-session`, {
        method: 'GET',
        headers: {
          'Cookie': `better-auth.session_token=${token2}`,
        },
      });

      expect(check2.ok).toBe(true);
    });
  });
});
