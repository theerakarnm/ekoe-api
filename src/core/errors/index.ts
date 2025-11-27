export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: any,
    public cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      details: this.details,
      cause: this.cause ? {
        message: this.cause.message,
        name: this.cause.name,
      } : undefined,
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT', details);
  }
}

// Authentication-specific errors
export class AuthInvalidCredentialsError extends AppError {
  constructor(message: string = 'Invalid email or password') {
    super(message, 401, 'AUTH_INVALID_CREDENTIALS');
  }
}

export class AuthEmailExistsError extends AppError {
  constructor(message: string = 'An account with this email already exists') {
    super(message, 409, 'AUTH_EMAIL_EXISTS');
  }
}

export class AuthEmailNotVerifiedError extends AppError {
  constructor(message: string = 'Email verification required. Please check your email for a verification link.') {
    super(message, 403, 'AUTH_EMAIL_NOT_VERIFIED');
  }
}

export class AuthInvalidTokenError extends AppError {
  constructor(message: string = 'Invalid or expired token. Please request a new one.') {
    super(message, 400, 'AUTH_INVALID_TOKEN');
  }
}

export class AuthSessionExpiredError extends AppError {
  constructor(message: string = 'Your session has expired. Please log in again.') {
    super(message, 401, 'AUTH_SESSION_EXPIRED');
  }
}

export class AuthGoogleFailedError extends AppError {
  constructor(message: string = 'Google authentication failed. Please try again.') {
    super(message, 500, 'AUTH_GOOGLE_FAILED');
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too many requests. Please try again later.') {
    super(message, 429, 'TOO_MANY_REQUESTS');
  }
}
