# Security Enhancements

This document describes the security enhancements implemented for the customer authentication system.

## Overview

The following security measures have been implemented to protect the authentication system and user data:

1. **Rate Limiting** - Prevents brute force attacks on authentication endpoints
2. **CSRF Protection** - Protects against cross-site request forgery attacks
3. **Enhanced Cookie Security** - Ensures secure session management

## 1. Rate Limiting

### Implementation

Rate limiting has been implemented using an in-memory store with automatic cleanup. The middleware tracks requests by IP address and enforces limits based on endpoint type.

**File**: `api/src/middleware/rate-limit.middleware.ts`

### Rate Limits

| Endpoint Type | Limit | Time Window | Purpose |
|--------------|-------|-------------|---------|
| Login (`/auth/sign-in/email`) | 5 attempts | 15 minutes | Prevent brute force password attacks |
| Registration (`/auth/sign-up/email`) | 3 attempts | 1 hour | Prevent spam account creation |
| Password Reset (`/auth/forget-password`, `/auth/reset-password`) | 3 attempts | 1 hour | Prevent password reset abuse |
| General Auth (`/auth/*`) | 20 requests | 1 minute | Prevent API abuse |

### Features

- **IP-based tracking**: Requests are tracked by client IP address
- **Automatic cleanup**: Old entries are removed every 5 minutes
- **Rate limit headers**: Responses include standard rate limit headers:
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Requests remaining in current window
  - `X-RateLimit-Reset`: Timestamp when the limit resets
  - `Retry-After`: Seconds to wait before retrying (when limit exceeded)
- **Graceful error handling**: Returns 429 status with clear error message

### Usage

```typescript
import { loginRateLimit, registrationRateLimit } from '../middleware/rate-limit.middleware';

// Apply to specific routes
router.post('/auth/sign-in/email', loginRateLimit);
router.post('/auth/sign-up/email', registrationRateLimit);
```

### Production Considerations

For production deployments with multiple servers, consider:
- Using Redis for distributed rate limiting
- Implementing more sophisticated key generation (e.g., IP + user agent)
- Adding allowlists for trusted IPs
- Implementing progressive delays instead of hard limits

## 2. CSRF Protection

### Implementation

CSRF protection is implemented at multiple layers:

**File**: `api/src/middleware/csrf.middleware.ts`

### Protection Layers

1. **Better-auth Built-in Protection**
   - Automatic CSRF token validation for state-changing operations
   - OAuth state parameter validation
   - Enabled by default, no configuration needed

2. **Origin Validation Middleware**
   - Validates `Origin` or `Referer` headers for state-changing requests
   - Only allows requests from configured trusted origins
   - Applied to POST, PUT, DELETE, PATCH methods

3. **Security Headers**
   - `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
   - `X-Frame-Options: DENY` - Prevents clickjacking
   - `X-XSS-Protection: 1; mode=block` - Enables XSS filtering
   - `Referrer-Policy: strict-origin-when-cross-origin` - Controls referrer information
   - `Content-Security-Policy` - Restricts resource loading

### Configuration

```typescript
// In api/src/index.ts
app.use('*', securityHeaders);
app.use('*', validateOrigin(['http://localhost:3000', 'http://localhost:5173']));
```

### Allowed Origins

Development:
- `http://localhost:3000` (API)
- `http://localhost:5173` (Web)

Production: Update these to your production domains

### Features

- **Automatic validation**: No changes needed to existing routes
- **Wildcard support**: Can use patterns like `https://*.yourdomain.com`
- **Logging**: Failed validations are logged for security monitoring
- **Graceful handling**: Missing origin/referer headers are allowed for same-origin requests

## 3. Enhanced Cookie Security

### Implementation

Cookie security is configured in the better-auth setup with production-ready defaults.

**File**: `api/src/libs/auth.ts`

### Cookie Attributes

| Attribute | Value | Purpose |
|-----------|-------|---------|
| `httpOnly` | `true` | Prevents JavaScript access (XSS protection) |
| `secure` | `true` (production) | Requires HTTPS |
| `sameSite` | `none` | Allows cross-origin requests |
| `partitioned` | `true` | CHIPS support for modern browsers |
| `maxAge` | 7 days | Cookie expiration time |
| `path` | `/` | Cookie available for all paths |

### Session Configuration

- **Session Duration**: 7 days
- **Update Frequency**: Session updated every 24 hours
- **Cache Duration**: Session data cached for 5 minutes
- **Automatic Expiration**: Expired sessions are automatically cleared

### Environment-Specific Settings

**Development**:
```typescript
secure: false  // Allows HTTP for localhost
sameSite: "none"  // Allows cross-origin
```

**Production**:
```typescript
secure: true  // Requires HTTPS
sameSite: "none" or "lax"  // Depending on domain setup
```

### Best Practices

1. **Always use HTTPS in production**
   - Set `NODE_ENV=production`
   - Obtain valid SSL/TLS certificates
   - Configure reverse proxy (nginx, etc.) for HTTPS

2. **Use strong session secrets**
   - Generate cryptographically secure random strings
   - Minimum 32 characters
   - Never commit to version control
   - Rotate periodically

3. **Consider same-domain deployment**
   - If API and Web are on same domain, use `sameSite: "lax"`
   - Provides better CSRF protection
   - Reduces attack surface

## Error Handling

### New Error Type

**TooManyRequestsError** (429)
- Thrown when rate limit is exceeded
- Includes retry-after information
- Logged for security monitoring

**File**: `api/src/core/errors/index.ts`

```typescript
export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too many requests. Please try again later.') {
    super(message, 429, 'TOO_MANY_REQUESTS');
  }
}
```

## Monitoring and Logging

### Logged Events

1. **Rate Limit Violations**
   - IP address
   - Endpoint
   - Current count
   - Retry-after time

2. **CSRF Validation Failures**
   - Request origin
   - Allowed origins
   - Request path
   - HTTP method

3. **Authentication Events**
   - Login attempts (success/failure)
   - Registration attempts
   - Password reset requests
   - Session creation/expiration

### Log Levels

- `INFO`: Successful operations
- `WARN`: Rate limits exceeded, CSRF failures
- `ERROR`: System errors, email delivery failures

## Testing

### Manual Testing

1. **Rate Limiting**
   ```bash
   # Test login rate limit (should fail after 5 attempts)
   for i in {1..6}; do
     curl -X POST http://localhost:3000/api/auth/sign-in/email \
       -H "Content-Type: application/json" \
       -d '{"email":"test@example.com","password":"wrong"}'
   done
   ```

2. **CSRF Protection**
   ```bash
   # Test with invalid origin (should fail)
   curl -X POST http://localhost:3000/api/customers/me \
       -H "Origin: https://evil.com" \
       -H "Content-Type: application/json" \
       -d '{}'
   ```

3. **Cookie Security**
   - Check browser DevTools → Application → Cookies
   - Verify `HttpOnly`, `Secure`, `SameSite` flags
   - Verify expiration time

### Automated Testing

Consider adding integration tests for:
- Rate limit enforcement
- CSRF validation
- Cookie attribute verification
- Session expiration handling

## Security Checklist

- [x] Rate limiting on authentication endpoints
- [x] CSRF protection with origin validation
- [x] Secure cookie configuration
- [x] Security headers on all responses
- [x] HTTPS enforcement in production
- [x] Session expiration and cleanup
- [x] Error logging and monitoring
- [ ] Redis-based rate limiting (production)
- [ ] Automated security testing
- [ ] Regular security audits
- [ ] Penetration testing

## References

- [OWASP Rate Limiting](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html)
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [MDN: HTTP Cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
- [Better-auth Security](https://better-auth.com/docs/security)

## Support

For security concerns or questions:
1. Review the documentation in `api/docs/`
2. Check application logs for security events
3. Contact the development team for assistance

**Never disclose security vulnerabilities publicly. Report them privately to the security team.**

