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

export default customersRoutes;
