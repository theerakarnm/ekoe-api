import { Hono } from 'hono';
import { requireCustomerAuth } from '../middleware/auth.middleware';
import { validateJson } from '../middleware/validation.middleware';
import { ResponseBuilder } from '../core/response';
import { customersDomain } from '../features/customers/customers.domain';
import { customersRepository } from '../features/customers/customers.repository';
import {
  updateCustomerProfileSchema,
  createCustomerAddressSchema,
  updateCustomerAddressSchema,
} from '../features/customers/customers.interface';
import { auth } from '../libs/auth';
import { emailService } from '../core/email';
import { logger } from '../core/logger';

const customersRoutes = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null
  }
}>();

// Apply customer authentication middleware to all routes
customersRoutes.use('/*', requireCustomerAuth);

// Profile endpoints
customersRoutes.get('/me', async (c) => {
  const user = c.get('user');
  if (!user) {
    return ResponseBuilder.error(c, 'User not found in context', 401, 'AUTH_UNAUTHORIZED');
  }

  const profileData = await customersDomain.getCustomerProfile(user.id);
  return ResponseBuilder.success(c, profileData);
});

customersRoutes.put('/me', validateJson(updateCustomerProfileSchema), async (c) => {
  const user = c.get('user');
  if (!user) {
    return ResponseBuilder.error(c, 'User not found in context', 401, 'AUTH_UNAUTHORIZED');
  }

  const data = await c.req.json();
  const profile = await customersDomain.updateCustomerProfile(user.id, data);
  return ResponseBuilder.success(c, profile);
});

// Address endpoints
customersRoutes.get('/me/addresses', async (c) => {
  const user = c.get('user');
  if (!user) {
    return ResponseBuilder.error(c, 'User not found in context', 401, 'AUTH_UNAUTHORIZED');
  }

  const addresses = await customersRepository.findAddressesByUserId(user.id);
  return ResponseBuilder.success(c, addresses);
});

customersRoutes.post('/me/addresses', validateJson(createCustomerAddressSchema), async (c) => {
  const user = c.get('user');
  if (!user) {
    return ResponseBuilder.error(c, 'User not found in context', 401, 'AUTH_UNAUTHORIZED');
  }

  const data = await c.req.json();
  // Ensure userId matches authenticated user
  const addressData = { ...data, userId: user.id };
  const address = await customersRepository.createAddress(addressData);
  return ResponseBuilder.created(c, address);
});

customersRoutes.put('/me/addresses/:id', validateJson(updateCustomerAddressSchema), async (c) => {
  const user = c.get('user');
  if (!user) {
    return ResponseBuilder.error(c, 'User not found in context', 401, 'AUTH_UNAUTHORIZED');
  }

  const id = c.req.param('id');
  const data = await c.req.json();
  const address = await customersRepository.updateAddress(id, user.id, data);
  return ResponseBuilder.success(c, address);
});

customersRoutes.delete('/me/addresses/:id', async (c) => {
  const user = c.get('user');
  if (!user) {
    return ResponseBuilder.error(c, 'User not found in context', 401, 'AUTH_UNAUTHORIZED');
  }

  const id = c.req.param('id');
  await customersRepository.deleteAddress(id, user.id);
  return ResponseBuilder.noContent(c);
});

// Order history endpoint
customersRoutes.get('/me/orders', async (c) => {
  const user = c.get('user');
  if (!user) {
    return ResponseBuilder.error(c, 'User not found in context', 401, 'AUTH_UNAUTHORIZED');
  }

  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '10');

  const orders = await customersRepository.findOrdersByUserId(user.id, { page, limit });
  return ResponseBuilder.success(c, orders);
});

// Email verification endpoint
customersRoutes.post('/me/resend-verification', async (c) => {
  const user = c.get('user');
  if (!user) {
    return ResponseBuilder.error(c, 'User not found in context', 401, 'AUTH_UNAUTHORIZED');
  }

  // Check if email is already verified
  if (user.emailVerified) {
    return ResponseBuilder.error(c, 'Email is already verified', 400, 'EMAIL_ALREADY_VERIFIED');
  }

  // Check if email service is enabled
  if (!emailService.isEnabled()) {
    logger.warn({ userId: user.id }, 'Cannot resend verification - SMTP not configured');
    return ResponseBuilder.error(
      c,
      'Email service is not configured. Please contact support.',
      503,
      'EMAIL_SERVICE_UNAVAILABLE'
    );
  }

  try {
    // Generate verification URL using better-auth
    // Note: Better-auth handles verification token generation internally
    // We'll need to trigger the verification email through better-auth's API
    const verificationUrl = `${c.req.url.split('/api')[0]}/auth/verify-email?token=${user.id}`;

    const sent = await emailService.sendVerificationEmail(
      user.email,
      user.name || 'Customer',
      verificationUrl
    );

    if (sent) {
      logger.info({ userId: user.id, email: user.email }, 'Verification email resent successfully');
      return ResponseBuilder.success(c, { message: 'Verification email sent successfully' });
    } else {
      logger.error({ userId: user.id, email: user.email }, 'Failed to resend verification email');
      return ResponseBuilder.error(
        c,
        'Failed to send verification email. Please try again later.',
        500,
        'EMAIL_SEND_FAILED'
      );
    }
  } catch (error) {
    logger.error({ error, userId: user.id }, 'Error resending verification email');
    return ResponseBuilder.error(
      c,
      'An error occurred while sending verification email',
      500,
      'INTERNAL_ERROR'
    );
  }
});

// Wishlist endpoints
customersRoutes.get('/me/wishlist', async (c) => {
  const user = c.get('user');
  if (!user) {
    return ResponseBuilder.error(c, 'User not found in context', 401, 'AUTH_UNAUTHORIZED');
  }

  const wishlist = await customersDomain.getWishlist(user.id);
  return ResponseBuilder.success(c, wishlist);
});

customersRoutes.post('/me/wishlist', async (c) => {
  const user = c.get('user');
  if (!user) {
    return ResponseBuilder.error(c, 'User not found in context', 401, 'AUTH_UNAUTHORIZED');
  }

  const { productId } = await c.req.json();
  if (!productId) {
    return ResponseBuilder.error(c, 'Product ID is required', 400, 'VALIDATION_ERROR');
  }

  const result = await customersDomain.addToWishlist(user.id, productId);
  return ResponseBuilder.created(c, result);
});

customersRoutes.delete('/me/wishlist/:productId', async (c) => {
  const user = c.get('user');
  if (!user) {
    return ResponseBuilder.error(c, 'User not found in context', 401, 'AUTH_UNAUTHORIZED');
  }

  const productId = c.req.param('productId');
  await customersDomain.removeFromWishlist(user.id, productId);
  return ResponseBuilder.noContent(c);
});

customersRoutes.delete('/me/wishlist', async (c) => {
  const user = c.get('user');
  if (!user) {
    return ResponseBuilder.error(c, 'User not found in context', 401, 'AUTH_UNAUTHORIZED');
  }

  await customersDomain.clearWishlist(user.id);
  return ResponseBuilder.noContent(c);
});

export default customersRoutes;
