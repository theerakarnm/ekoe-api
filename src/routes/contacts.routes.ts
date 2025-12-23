import { Hono } from 'hono';
import { requireAdminAuth } from '../middleware/auth.middleware';
import { validateJson } from '../middleware/validation.middleware';
import { ResponseBuilder } from '../core/response';
import { contactsDomain } from '../features/contacts/contacts.domain';
import { z } from 'zod';
import { auth } from '../libs/auth';

const contactsRoutes = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null
  }
}>();

// Validation schemas
const createContactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Invalid email address'),
  topic: z.string().min(1, 'Topic is required').max(255),
  message: z.string().min(1, 'Message is required'),
});

const updateStatusSchema = z.object({
  status: z.enum(['unread', 'read', 'responded']),
});

// ==========================================
// PUBLIC ROUTES
// ==========================================

/**
 * POST /contacts - Submit a contact form (public)
 */
contactsRoutes.post('/', validateJson(createContactSchema), async (c) => {
  const data = await c.req.json();
  const contact = await contactsDomain.submitContact(data);
  return ResponseBuilder.created(c, contact);
});

// ==========================================
// ADMIN ROUTES
// ==========================================

/**
 * GET /contacts/admin - List all contacts (admin only)
 */
contactsRoutes.get('/admin', requireAdminAuth, async (c) => {
  const page = Number(c.req.query('page') || '1');
  const limit = Number(c.req.query('limit') || '20');
  const status = c.req.query('status') as 'unread' | 'read' | 'responded' | undefined;
  const search = c.req.query('search');

  const result = await contactsDomain.getContacts({
    page,
    limit,
    status,
    search,
  });

  return ResponseBuilder.success(c, result);
});

/**
 * GET /contacts/admin/unread-count - Get unread count for notification badge (admin only)
 */
contactsRoutes.get('/admin/unread-count', requireAdminAuth, async (c) => {
  const count = await contactsDomain.getUnreadCount();
  return ResponseBuilder.success(c, { count });
});

/**
 * GET /contacts/admin/:id - Get a single contact (admin only)
 */
contactsRoutes.get('/admin/:id', requireAdminAuth, async (c) => {
  const id = c.req.param('id');
  const contact = await contactsDomain.getContactById(id);
  return ResponseBuilder.success(c, contact);
});

/**
 * PATCH /contacts/admin/:id/status - Update contact status (admin only)
 */
contactsRoutes.patch('/admin/:id/status', requireAdminAuth, validateJson(updateStatusSchema), async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const contact = await contactsDomain.updateContactStatus(id, data);
  return ResponseBuilder.success(c, contact);
});

/**
 * DELETE /contacts/admin/:id - Delete a contact (admin only)
 */
contactsRoutes.delete('/admin/:id', requireAdminAuth, async (c) => {
  const id = c.req.param('id');
  await contactsDomain.deleteContact(id);
  return ResponseBuilder.noContent(c);
});

export default contactsRoutes;
