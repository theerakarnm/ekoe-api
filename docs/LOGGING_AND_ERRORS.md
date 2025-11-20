# Logging, Error Handling & Standard Responses

## Pino Logger

The API uses Pino for structured logging with pretty printing in development.

### Usage

```typescript
import logger from './core/logger';

// Log levels
logger.info('Information message');
logger.debug('Debug message');
logger.warn('Warning message');
logger.error('Error message');

// Structured logging
logger.info({
  userId: 123,
  action: 'login',
  timestamp: new Date(),
});
```

## Error Handling

Custom error classes that extend `AppError` for consistent error handling.

### Available Error Classes

```typescript
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} from './core/errors';

// Generic error
throw new AppError('Something went wrong', 500, 'ERROR_CODE', { details });

// Validation error (400)
throw new ValidationError('Invalid input', { field: 'email' });

// Not found (404)
throw new NotFoundError('User');

// Unauthorized (401)
throw new UnauthorizedError('Invalid token');

// Forbidden (403)
throw new ForbiddenError('Access denied');

// Conflict (409)
throw new ConflictError('Email already exists');
```

## Standard API Response Format

All API responses follow a consistent format using `ResponseBuilder`.

### Success Response

```typescript
import { ResponseBuilder } from './core/response';

// Standard success (200)
return ResponseBuilder.success(c, { id: 1, name: 'John' });

// Created (201)
return ResponseBuilder.created(c, newUser);

// No content (204)
return ResponseBuilder.noContent(c);
```

**Response Format:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John"
  },
  "meta": {
    "timestamp": "2025-11-20T10:30:00.000Z",
    "requestId": "abc-123"
  }
}
```

### Error Response

Errors are automatically caught by the error middleware and formatted.

**Response Format:**
```json
{
  "success": false,
  "error": {
    "message": "User not found",
    "code": "NOT_FOUND",
    "details": null
  },
  "meta": {
    "timestamp": "2025-11-20T10:30:00.000Z",
    "requestId": "abc-123"
  }
}
```

## Example Route Handler

```typescript
import { Context } from 'hono';
import { NotFoundError } from '../core/errors';
import { ResponseBuilder } from '../core/response';
import logger from '../core/logger';

export const getUser = async (c: Context) => {
  const id = c.req.param('id');
  
  logger.info({ action: 'getUser', userId: id });
  
  const user = await db.findUser(id);
  
  if (!user) {
    throw new NotFoundError('User');
  }
  
  return ResponseBuilder.success(c, user);
};
```
