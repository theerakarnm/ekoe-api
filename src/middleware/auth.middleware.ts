import { Context, Next } from 'hono';
import { auth } from '../libs/auth';

/**
 * Middleware for customer routes - requires any authenticated user
 * Validates session exists and sets user/session in context
 */
export const requireCustomerAuth = async (c: Context, next: Next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ 
      success: false,
      error: {
        code: 'AUTH_UNAUTHORIZED',
        message: 'Authentication required'
      }
    }, 401);
  }

  c.set('user', session.user);
  c.set('session', session.session);
  await next();
};

/**
 * Middleware for admin routes - requires authenticated user with admin role
 * Validates session exists and checks user role is 'admin'
 */
export const requireAdminAuth = async (c: Context, next: Next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ 
      success: false,
      error: {
        code: 'AUTH_UNAUTHORIZED',
        message: 'Authentication required'
      }
    }, 401);
  }

  // Check if user has admin role
  if (session.user.role !== 'admin') {
    return c.json({ 
      success: false,
      error: {
        code: 'AUTH_FORBIDDEN',
        message: 'Admin access required'
      }
    }, 403);
  }

  c.set('user', session.user);
  c.set('session', session.session);
  await next();
};

/**
 * Middleware for public routes - optional authentication
 * Checks for session but doesn't require it
 * Sets user/session in context if present, continues regardless
 */
export const optionalAuth = async (c: Context, next: Next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (session) {
    c.set('user', session.user);
    c.set('session', session.session);
  }

  await next();
};

/**
 * Middleware to require email verification
 * Must be used after requireCustomerAuth or requireAdminAuth
 * Checks if user email is verified
 */
export const requireEmailVerification = async (c: Context, next: Next) => {
  const user = c.get('user');

  if (!user) {
    return c.json({ 
      success: false,
      error: {
        code: 'AUTH_UNAUTHORIZED',
        message: 'Authentication required'
      }
    }, 401);
  }

  if (!user.emailVerified) {
    return c.json({ 
      success: false,
      error: {
        code: 'AUTH_EMAIL_NOT_VERIFIED',
        message: 'Email verification required'
      }
    }, 403);
  }

  await next();
};

/**
 * @deprecated Use requireAdminAuth instead
 * Legacy middleware for backward compatibility
 */
export const authMiddleware = requireAdminAuth;
