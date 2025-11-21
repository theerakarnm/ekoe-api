import { Hono } from 'hono';
import { auth } from '../core/auth';
import usersRoutes from './users.routes';
import adminRoutes from './admin.routes';

const router = new Hono();

// Auth routes
router.on(['POST', 'GET'], '/auth/*', (c) => auth.handler(c.req.raw));

// Feature routes
router.route('/users', usersRoutes);
router.route('/admin', adminRoutes);

export default router;
