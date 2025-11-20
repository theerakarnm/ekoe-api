import { Hono } from 'hono';
import { usersDomain } from '../features/users/users.domain';
import { createUserSchema, updateUserSchema } from '../features/users/users.interface';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateJson } from '../middleware/validation.middleware';
import { ResponseBuilder } from '../core/response';

const usersRoutes = new Hono();

usersRoutes.get('/', authMiddleware, async (c) => {
  const users = await usersDomain.getAllUsers();
  return ResponseBuilder.success(c, users);
});

usersRoutes.get('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const user = await usersDomain.getUserById(id);
  return ResponseBuilder.success(c, user);
});

usersRoutes.post('/', validateJson(createUserSchema), async (c) => {
  const data = await c.req.json();
  const user = await usersDomain.createUser(data);
  return ResponseBuilder.created(c, user);
});

usersRoutes.patch('/:id', authMiddleware, validateJson(updateUserSchema), async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  const user = await usersDomain.updateUser(id, data);
  return ResponseBuilder.success(c, user);
});

usersRoutes.delete('/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  await usersDomain.deleteUser(id);
  return ResponseBuilder.noContent(c);
});

export default usersRoutes;
