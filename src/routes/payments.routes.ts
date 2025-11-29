import { Hono } from 'hono';
import { requireAdminAuth, requireCustomerAuth } from '../middleware/auth.middleware';
import { validateJson } from '../middleware/validation.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { ResponseBuilder } from '../core/response';
import { paymentsDomain } from '../features/payments/payments.domain';
import {
  createPromptPayPaymentSchema,
  create2C2PPaymentSchema,
  manualVerifyPaymentSchema,
} from '../features/payments/payments.interface';
import { auth } from '../libs/auth';
import { logger } from '../core/logger';
import { config } from '../core/config';

const paymentsRoutes = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

// Rate limiter for payment creation (10 requests per minute per IP)
const paymentCreationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  keyGenerator: (c) => {
    const forwarded = c.req.header('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0].trim() : c.req.header('x-real-ip') || 'unknown';
    return `payment:${ip}`;
  },
});

// ============================================================================
// Public Payment Routes
// ============================================================================

/**
 * POST /api/payments/promptpay
 * Create PromptPay payment and generate QR code
 */
paymentsRoutes.post(
  '/payments/promptpay',
  requireCustomerAuth,
  paymentCreationRateLimit,
  validateJson(createPromptPayPaymentSchema),
  async (c) => {
    const { orderId, amount } = await c.req.json();

    const result = await paymentsDomain.processPromptPayPayment(orderId, amount);

    logger.info(
      { paymentId: result.paymentId, orderId, amount },
      'PromptPay payment created'
    );

    return ResponseBuilder.created(c, result);
  }
);

/**
 * POST /api/payments/2c2p/initiate
 * Initiate 2C2P payment and get redirect URL
 */
paymentsRoutes.post(
  '/payments/2c2p/initiate',
  requireCustomerAuth,
  paymentCreationRateLimit,
  validateJson(create2C2PPaymentSchema),
  async (c) => {
    const { orderId, amount, returnUrl } = await c.req.json();

    const result = await paymentsDomain.initiate2C2PPayment(
      orderId,
      amount,
      returnUrl
    );

    logger.info(
      { paymentId: result.paymentId, orderId, amount },
      '2C2P payment initiated'
    );

    return ResponseBuilder.created(c, result);
  }
);

/**
 * GET /api/payments/:id/status
 * Get payment status for polling
 */
paymentsRoutes.get('/payments/:id/status', requireCustomerAuth, async (c) => {
  const id = c.req.param('id');

  const status = await paymentsDomain.getPaymentStatus(id);

  return ResponseBuilder.success(c, status);
});

/**
 * GET /api/payments/2c2p/return
 * Handle 2C2P return URL after payment
 */
paymentsRoutes.get('/payments/2c2p/return', async (c) => {
  const orderId = c.req.query('order_id');
  const paymentStatus = c.req.query('payment_status');
  const transactionRef = c.req.query('transaction_ref');

  if (!orderId || !paymentStatus) {
    return ResponseBuilder.error(
      c,
      'Missing required parameters',
      400,
      'INVALID_PARAMETERS'
    );
  }

  const result = await paymentsDomain.handle2C2PReturn({
    order_id: orderId,
    payment_status: paymentStatus,
    transaction_ref: transactionRef,
  });

  logger.info(
    { paymentId: orderId, paymentStatus, transactionRef },
    '2C2P return processed'
  );

  return ResponseBuilder.success(c, result);
});

// ============================================================================
// Webhook Routes (No authentication - signature verified in handler)
// ============================================================================

/**
 * POST /api/webhooks/promptpay
 * Handle PromptPay webhook notifications
 */
paymentsRoutes.post('/webhooks/promptpay', async (c) => {
  try {
    const payload = await c.req.json();
    const signature = c.req.header('x-webhook-signature') || '';

    logger.info(
      { 
        transactionId: payload.transactionId,
        status: payload.status,
        referenceId: payload.referenceId 
      },
      'PromptPay webhook received'
    );

    // Process webhook with signature verification
    await paymentsDomain.handlePromptPayWebhook(
      payload,
      signature,
      config.payment.promptpay.webhookSecret
    );

    logger.info(
      { transactionId: payload.transactionId },
      'PromptPay webhook processed successfully'
    );

    // Always return 200 OK to acknowledge receipt
    return ResponseBuilder.success(c, { received: true });
  } catch (error) {
    // Log error but still return 200 to prevent retries
    logger.error(
      { error, body: await c.req.text() },
      'Error processing PromptPay webhook'
    );

    // Return 200 OK even on error to acknowledge receipt
    return ResponseBuilder.success(c, { received: true, error: 'Processing failed' });
  }
});

/**
 * POST /api/webhooks/2c2p
 * Handle 2C2P webhook notifications
 */
paymentsRoutes.post('/webhooks/2c2p', async (c) => {
  try {
    const payload = await c.req.json();

    logger.info(
      { 
        orderId: payload.order_id,
        paymentStatus: payload.payment_status,
        transactionRef: payload.transaction_ref 
      },
      '2C2P webhook received'
    );

    // Process webhook (signature verification done in domain)
    await paymentsDomain.handle2C2PWebhook(payload);

    logger.info(
      { 
        orderId: payload.order_id,
        transactionRef: payload.transaction_ref 
      },
      '2C2P webhook processed successfully'
    );

    // Always return 200 OK to acknowledge receipt
    return ResponseBuilder.success(c, { received: true });
  } catch (error) {
    // Log error but still return 200 to prevent retries
    logger.error(
      { error, body: await c.req.text() },
      'Error processing 2C2P webhook'
    );

    // Return 200 OK even on error to acknowledge receipt
    return ResponseBuilder.success(c, { received: true, error: 'Processing failed' });
  }
});

// ============================================================================
// Admin Payment Routes
// ============================================================================

/**
 * GET /api/admin/payments
 * List all payments with filtering and pagination
 */
paymentsRoutes.get('/admin/payments', requireAdminAuth, async (c) => {
  const page = Number(c.req.query('page') || '1');
  const limit = Number(c.req.query('limit') || '20');
  const orderId = c.req.query('orderId');

  // Import repository to access list method
  const { paymentsRepository } = await import('../features/payments/payments.repository');

  // Get payments with filters
  const payments = await paymentsRepository.getPaymentsByOrderId(orderId || '');

  // TODO: Implement proper pagination and filtering in repository
  // For now, return all payments for the order or empty array
  const result = {
    data: payments,
    pagination: {
      page,
      limit,
      total: payments.length,
      totalPages: Math.ceil(payments.length / limit),
    },
  };

  return ResponseBuilder.success(c, result);
});

/**
 * GET /api/admin/payments/:id
 * Get detailed payment information
 */
paymentsRoutes.get('/admin/payments/:id', requireAdminAuth, async (c) => {
  const id = c.req.param('id');

  const { paymentsRepository } = await import('../features/payments/payments.repository');
  const payment = await paymentsRepository.getPaymentById(id);

  if (!payment) {
    return ResponseBuilder.error(c, 'Payment not found', 404, 'NOT_FOUND');
  }

  return ResponseBuilder.success(c, payment);
});

/**
 * POST /api/admin/payments/:id/verify
 * Manually verify a payment (admin action)
 */
paymentsRoutes.post(
  '/admin/payments/:id/verify',
  requireAdminAuth,
  validateJson(manualVerifyPaymentSchema),
  async (c) => {
    const id = c.req.param('id');
    const { note } = await c.req.json();
    const user = c.get('user');

    if (!user) {
      return ResponseBuilder.error(
        c,
        'User not found in context',
        401,
        'UNAUTHORIZED'
      );
    }

    await paymentsDomain.manuallyVerifyPayment(id, user.id, note);

    logger.info(
      { paymentId: id, adminId: user.id, note },
      'Payment manually verified by admin'
    );

    return ResponseBuilder.success(c, { 
      message: 'Payment verified successfully',
      paymentId: id 
    });
  }
);

export default paymentsRoutes;
