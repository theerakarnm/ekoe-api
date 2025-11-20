/**
 * Example usage of ResponseBuilder and Error classes
 * 
 * This file demonstrates how to use the standard response format
 * and custom error classes in your route handlers.
 */

import { Context } from 'hono';
import { AppError, NotFoundError, ValidationError } from '../errors';
import { ResponseBuilder } from './index';

// Example 1: Success response
export const getUserExample = async (c: Context) => {
  const user = { id: 1, name: 'John Doe', email: 'john@example.com' };
  return ResponseBuilder.success(c, user);
};

// Example 2: Created response
export const createUserExample = async (c: Context) => {
  const newUser = { id: 2, name: 'Jane Doe', email: 'jane@example.com' };
  return ResponseBuilder.created(c, newUser);
};

// Example 3: No content response
export const deleteUserExample = async (c: Context) => {
  // Delete logic here
  return ResponseBuilder.noContent(c);
};

// Example 4: Throwing custom errors (caught by error middleware)
export const throwNotFoundExample = async (c: Context) => {
  throw new NotFoundError('User');
};

export const throwValidationExample = async (c: Context) => {
  throw new ValidationError('Invalid email format', {
    field: 'email',
    value: 'invalid-email',
  });
};

export const throwCustomErrorExample = async (c: Context) => {
  throw new AppError('Custom error message', 400, 'CUSTOM_CODE', {
    additionalInfo: 'Some details',
  });
};
