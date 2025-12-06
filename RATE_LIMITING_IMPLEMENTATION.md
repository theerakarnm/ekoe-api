# Rate Limiting Implementation

## Overview

Rate limiting has been implemented for cart validation, discount validation, and webhook endpoints to protect against abuse and ensure system stability.

## Implementation Details

### Rate Limiters Added

Three new rate limiters have been added to `api/src/middleware/rate-limit.middleware.ts`:

#### 1. Cart Validation Rate Limit
- **Endpoint**: `POST /api/cart/validate`
- **Limit**: 30 requests per minute per IP
- **Purpose**: Prevents abuse of cart validation endpoint while allowing normal shopping behavior
- **Key**: `cart-validate:{ip}`

#### 2. Discount Validation Rate Limit
- **Endpoint**: `POST /api/cart/discount/validate`
- **Limit**: 20 requests per minute per IP
- **Purpose**: Prevents brute-force attempts to discover valid discount codes
- **Key**: `discount-validate:{ip}`

#### 3. Webhook Rate Limit
- **Endpoints**: 
  - `POST /api/webhooks/promptpay`
  - `POST /api/webhooks/2c2p`
- **Limit**: 100 requests per minute per IP
- **Purpose**: Protects webhook endpoints from abuse while allowing legitimate webhook bursts
- **Key**: `webhook:{ip}`

### Rate Limit Configuration

All rate limiters use:
- **Window**: 60 seconds (1 minute)
- **Key Generation**: IP address from `x-forwarded-for` or `x-real-ip` headers
- **Response Headers**: 
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Requests remaining in current window
  - `X-RateLimit-Reset`: Timestamp when the limit resets
  - `Retry-After`: Seconds to wait before retrying (when limit exceeded)

### Error Response

When rate limit is exceeded, the API returns:
- **Status Code**: 429 Too Many Requests
- **Error Code**: `TOO_MANY_REQUESTS`
- **Message**: "Too many requests. Please try again in X seconds."

### Storage

Rate limiting uses an in-memory store with automatic cleanup:
- Old entries are cleaned up every 5 minutes
- For production, consider using Redis for distributed rate limiting across multiple servers

## Applied Endpoints

### Cart Routes (`api/src/routes/cart.routes.ts`)
- `POST /api/cart/validate` - Cart validation rate limit applied
- `POST /api/cart/discount/validate` - Discount validation rate limit applied

### Payment Routes (`api/src/routes/payments.routes.ts`)
- `POST /api/webhooks/promptpay` - Webhook rate limit applied
- `POST /api/webhooks/2c2p` - Webhook rate limit applied

## Security Benefits

1. **Prevents Brute Force**: Discount code validation is protected against brute-force attacks
2. **Protects Resources**: Cart validation endpoint is protected from excessive requests
3. **Webhook Protection**: Webhook endpoints are protected from malicious flooding
4. **Fair Usage**: Ensures fair resource allocation across all users
5. **DDoS Mitigation**: Provides basic protection against distributed denial-of-service attacks

## Monitoring

Rate limit events are logged with the following information:
- IP address
- Request count
- Maximum allowed requests
- Retry-after time

Example log entry:
```json
{
  "level": "warn",
  "key": "cart-validate:192.168.1.1",
  "count": 30,
  "maxRequests": 30,
  "retryAfter": 45,
  "msg": "Rate limit exceeded"
}
```

## Future Improvements

1. **Redis Integration**: For distributed rate limiting across multiple API servers
2. **User-Based Limits**: Rate limit by user ID for authenticated requests
3. **Dynamic Limits**: Adjust limits based on user tier or subscription level
4. **Rate Limit Bypass**: Allow certain IPs (e.g., internal services) to bypass rate limits
5. **Metrics**: Track rate limit hits for monitoring and alerting

## Testing

To test rate limiting:

1. **Cart Validation**: Make 31 requests to `/api/cart/validate` within 1 minute
2. **Discount Validation**: Make 21 requests to `/api/cart/discount/validate` within 1 minute
3. **Webhooks**: Make 101 requests to `/api/webhooks/promptpay` within 1 minute

Expected response on limit exceeded:
```json
{
  "success": false,
  "error": {
    "message": "Too many requests. Please try again in 45 seconds.",
    "code": "TOO_MANY_REQUESTS"
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

## Requirements Satisfied

This implementation satisfies **Requirement 10.2** from the design document:
- Rate limiting has been implemented on cart validation endpoint
- Rate limiting has been implemented on discount validation endpoint
- Rate limiting has been implemented on webhook endpoints
