import { Context, Next } from 'hono';
import { TooManyRequestsError } from '../core/errors';
import { logger } from '../core/logger';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (c: Context) => string; // Function to generate unique key for rate limiting
  skipSuccessfulRequests?: boolean; // Don't count successful requests
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting
// In production, consider using Redis for distributed rate limiting
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Default key generator - uses IP address
 */
const defaultKeyGenerator = (c: Context): string => {
  const forwarded = c.req.header('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : c.req.header('x-real-ip') || 'unknown';
  return ip;
};

/**
 * Create a rate limiting middleware
 */
export const rateLimit = (config: RateLimitConfig) => {
  const keyGenerator = config.keyGenerator || defaultKeyGenerator;

  return async (c: Context, next: Next) => {
    const key = keyGenerator(c);
    const now = Date.now();

    // Get or create rate limit entry
    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
      // Create new entry or reset expired entry
      entry = {
        count: 0,
        resetTime: now + config.windowMs,
      };
      rateLimitStore.set(key, entry);
    }

    // Check if limit exceeded
    if (entry.count >= config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      
      logger.warn({
        key,
        count: entry.count,
        maxRequests: config.maxRequests,
        retryAfter,
      }, 'Rate limit exceeded');

      c.header('Retry-After', retryAfter.toString());
      c.header('X-RateLimit-Limit', config.maxRequests.toString());
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', entry.resetTime.toString());

      throw new TooManyRequestsError(
        `Too many requests. Please try again in ${retryAfter} seconds.`
      );
    }

    // Increment counter
    entry.count++;

    // Set rate limit headers
    c.header('X-RateLimit-Limit', config.maxRequests.toString());
    c.header('X-RateLimit-Remaining', (config.maxRequests - entry.count).toString());
    c.header('X-RateLimit-Reset', entry.resetTime.toString());

    await next();

    // If skipSuccessfulRequests is true and request was successful, decrement counter
    if (config.skipSuccessfulRequests && c.res.status < 400) {
      entry.count--;
    }
  };
};

/**
 * Preset rate limiters for common use cases
 */

// Strict rate limit for login attempts (5 attempts per 15 minutes)
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  keyGenerator: (c) => {
    // Rate limit by IP + email combination for login
    const ip = defaultKeyGenerator(c);
    const body = c.req.raw.body;
    // For login, we want to rate limit by IP primarily
    return `login:${ip}`;
  },
});

// Moderate rate limit for registration (3 attempts per hour)
export const registrationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3,
  keyGenerator: (c) => {
    const ip = defaultKeyGenerator(c);
    return `register:${ip}`;
  },
});

// Strict rate limit for password reset (3 attempts per hour)
export const passwordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3,
  keyGenerator: (c) => {
    const ip = defaultKeyGenerator(c);
    return `reset:${ip}`;
  },
});

// General auth rate limit (20 requests per minute)
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20,
  keyGenerator: (c) => {
    const ip = defaultKeyGenerator(c);
    return `auth:${ip}`;
  },
});

