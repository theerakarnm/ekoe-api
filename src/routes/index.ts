import { Hono } from 'hono';
import adminRoutes from './admin.routes';
import productsRoutes from './products.routes';
import ordersRoutes from './orders.routes';
import customersRoutes from './customers.routes';
import analyticsRoutes from './analytics.routes';
import paymentsRoutes from './payments.routes';
import cartRoutes from './cart.routes';
import { promotionalCart } from './promotional-cart.routes';
import { promotions } from './promotions.routes';
import { cors } from 'hono/cors';
import { auth } from '../libs/auth';
import {
  loginRateLimit,
  registrationRateLimit,
  passwordResetRateLimit,
  authRateLimit
} from '../middleware/rate-limit.middleware';

const router = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null
  }
}>();

router.use(
  "/auth/*", // or replace with "*" to enable cors for all routes
  cors({
    origin: ['http://localhost:5173', 'https://qas-ekoe.theerakarnm.dev'], // replace with your origin
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
)

// Apply rate limiting to specific auth endpoints
router.post('/auth/sign-in/email', loginRateLimit);
router.post('/auth/sign-up/email', registrationRateLimit);
router.post('/auth/forget-password', passwordResetRateLimit);
router.post('/auth/reset-password', passwordResetRateLimit);

// General rate limit for all other auth endpoints
router.use('/auth/*', authRateLimit);

// Auth routes with profile auto-creation
router.on(['POST', 'GET'], '/auth/*', async (c) => {
  const response = await auth.handler(c.req.raw);

  // Check if this is a successful sign-up or OAuth callback
  const url = new URL(c.req.url);
  const path = url.pathname;

  // Handle profile creation after successful authentication
  if (response.status === 200 || response.status === 302) {
    try {
      // Clone response to read body without consuming it
      const clonedResponse = response.clone();
      const contentType = clonedResponse.headers.get('content-type');
      const cookieData = response.headers.get('set-cookie')?.split(',').map((cookie) => cookie.split(';')[0].trim())?.join('; ')
      clonedResponse.headers.append('Cookie', cookieData || '')
      const session = await auth.api.getSession({
        headers: clonedResponse.headers
      })

      console.log({ cookieData, session })

      // Only process JSON responses (sign-up/sign-in endpoints)
      if (contentType?.includes('application/json')) {
        try {


          // Check if user data is present in response
          if (session && typeof session === 'object' && 'user' in session && session.user && typeof session.user === 'object' && 'id' in session.user) {
            const { createCustomerProfileAfterAuth } = await import('../libs/auth');

            // Create profile for email sign-up or OAuth
            if (path.includes('/sign-up/email') || path.includes('/callback/')) {
              const userName = 'name' in session.user ? session.user.name : undefined;
              await createCustomerProfileAfterAuth(session.user.id as string, userName as string | undefined);
            }
          }
        } catch (e) {
          // Ignore JSON parse errors for empty bodies (common in redirects)
        }
      }
    } catch (error) {
      // Log error but don't fail the auth response
      console.error('Failed to create customer profile:', error);
    }
  }

  return response;
});

// Feature routes
router.route('/admin', adminRoutes);
router.route('/customers', customersRoutes);
router.route('/products', productsRoutes);
router.route('/cart', cartRoutes);
router.route('/cart/promotional', promotionalCart);
router.route('/promotions', promotions);

// Orders routes (includes both /orders and /admin/orders paths)
router.route('/', ordersRoutes);

// Analytics routes (includes /admin/analytics and /admin/dashboard paths)
router.route('/', analyticsRoutes);

// Payment routes (includes /payments, /webhooks, and /admin/payments paths)
router.route('/', paymentsRoutes);

export default router;
