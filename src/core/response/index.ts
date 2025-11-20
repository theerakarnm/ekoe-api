import { Context } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

export class ResponseBuilder {
  static success<T>(c: Context, data: T, status: ContentfulStatusCode = 200): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: c.req.header('x-request-id'),
      },
    };
    return c.json(response, status);
  }

  static error(
    c: Context,
    message: string,
    status: ContentfulStatusCode = 500,
    code?: string,
    details?: any
  ): Response {
    const response: ApiResponse = {
      success: false,
      error: {
        message,
        code,
        details,
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId: c.req.header('x-request-id'),
      },
    };
    return c.json(response, status);
  }

  static created<T>(c: Context, data: T): Response {
    return this.success(c, data, 201);
  }

  static noContent(c: Context): Response {
    return c.body(null, 204);
  }
}
