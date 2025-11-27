import { Context, Next } from 'hono';
import { ForbiddenError } from '../core/errors';
import { logger } from '../core/logger';

/**
 * CSRF Protection Middleware
 * 
 * Better-auth provides built-in CSRF protection for authentication endpoints.
 * This middleware adds an additional layer of protection for custom endpoints.
 * 
 * CSRF protection strategy:
 * 1. Better-auth automatically validates CSRF tokens for auth operations
 * 2. OAuth state parameter is validated automatically by better-auth
 * 3. This middleware adds origin/referer validation for additional security
 */

/**
 * Validate origin/referer headers to prevent CSRF attacks
 * This is a defense-in-depth measure in addition to better-auth's built-in CSRF protection
 */
export const validateOrigin = (allowedOrigins: string[]) => {
  return async (c: Context, next: Next) => {
    const method = c.req.method;

    // Only validate state-changing methods
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      const origin = c.req.header('origin');
      const referer = c.req.header('referer');

      // Check if origin or referer is present and matches allowed origins
      const requestOrigin = origin || (referer ? new URL(referer).origin : null);

      if (!requestOrigin) {
        logger.warn({ method, path: c.req.path }, 'Request missing origin/referer header');
        // Allow requests without origin/referer for same-origin requests
        // This can happen with some browsers/configurations
        await next();
        return;
      }

      const isAllowed = allowedOrigins.some(allowed => {
        // Support wildcard subdomains
        if (allowed.includes('*')) {
          const pattern = allowed.replace('*', '.*');
          const regex = new RegExp(`^${pattern}$`);
          return regex.test(requestOrigin);
        }
        return requestOrigin === allowed;
      });

      if (!isAllowed) {
        logger.warn({
          method,
          path: c.req.path,
          origin: requestOrigin,
          allowedOrigins,
        }, 'CSRF validation failed: origin not allowed');

        throw new ForbiddenError('Invalid origin');
      }
    }

    await next();
  };
};

/**
 * Add security headers to responses
 */
export const securityHeaders = async (c: Context, next: Next) => {
  await next();

  // Add security headers to response
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  if (c.req.path.startsWith('/auth')) {
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    );
  }
};

