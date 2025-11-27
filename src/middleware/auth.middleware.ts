import { Context, Next } from 'hono';
import { auth } from '../libs/auth';
import { UnauthorizedError, AuthEmailNotVerifiedError } from '../core/errors';

/**
 * Middleware for customer routes - requires any authenticated user
 * Validates session exists and sets user/session in context
 */
export const requireCustomerAuth = async (c: Context, next: Next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    throw new UnauthorizedError('Authentication required');
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
    throw new UnauthorizedError('Authentication required');
  }

  // Check if user has admin role
  if (session.user.role !== 'admin') {
    throw new UnauthorizedError('Admin access required');
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
    throw new UnauthorizedError('Authentication required');
  }

  if (!user.emailVerified) {
    throw new AuthEmailNotVerifiedError();
  }

  await next();
};

/**
 * @deprecated Use requireAdminAuth instead
 * Legacy middleware for backward compatibility
 */
export const authMiddleware = requireAdminAuth;
