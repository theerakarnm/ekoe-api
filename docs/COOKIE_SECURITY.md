# Cookie Security Configuration

## Overview

This document describes the cookie security configuration for the authentication system. The application uses better-auth for authentication, which provides secure session management through HTTP-only cookies.

## Cookie Attributes

### HttpOnly
- **Value**: `true`
- **Purpose**: Prevents JavaScript access to cookies, protecting against XSS attacks
- **Impact**: Cookies cannot be read by client-side scripts

### Secure
- **Value**: `true` in production, `false` in development
- **Purpose**: Ensures cookies are only transmitted over HTTPS
- **Impact**: In production, cookies will not be sent over insecure HTTP connections
- **Development**: Set to `false` for localhost testing without HTTPS

### SameSite
- **Value**: `none`
- **Purpose**: Controls when cookies are sent with cross-origin requests
- **Options**:
  - `strict`: Cookie only sent for same-site requests
  - `lax`: Cookie sent for top-level navigation and same-site requests
  - `none`: Cookie sent for all requests (requires `Secure` flag)
- **Current Setting**: `none` to support API and Web on different origins
- **Production Recommendation**: If API and Web are on the same domain, consider using `lax` for better CSRF protection

### Partitioned
- **Value**: `true`
- **Purpose**: Enables CHIPS (Cookies Having Independent Partitioned State)
- **Impact**: Helps with third-party cookie restrictions in modern browsers
- **Browser Support**: Chrome 114+, Edge 114+, Safari (in development)

### MaxAge
- **Value**: `604800` seconds (7 days)
- **Purpose**: Sets cookie expiration time
- **Impact**: Cookies automatically expire after 7 days
- **Session Behavior**: Session is also validated server-side with the same expiration

### Path
- **Value**: `/`
- **Purpose**: Restricts cookie to specific URL paths
- **Impact**: Cookie is available for all paths on the domain

### Domain
- **Value**: Not set (defaults to current domain)
- **Purpose**: Controls which domains can access the cookie
- **Production**: Can be set to `.yourdomain.com` to allow subdomain access
- **Security**: More restrictive is more secure

## Session Configuration

### Session Expiration
- **Duration**: 7 days
- **Update Frequency**: Session updated every 24 hours
- **Cache**: Session data cached for 5 minutes

### Session Validation
- Sessions are validated on every request to protected endpoints
- Expired sessions are automatically cleared
- Session data includes user ID, role, and metadata

## CSRF Protection

### Built-in Protection
Better-auth provides built-in CSRF protection:
- CSRF tokens validated for state-changing operations
- OAuth state parameter validated automatically
- Origin/Referer headers validated by custom middleware

### Additional Measures
- Origin validation middleware checks request origin
- Security headers added to all responses
- Rate limiting on authentication endpoints

## Security Headers

The following security headers are added to all responses:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
```

## Rate Limiting

Authentication endpoints are protected with rate limiting:

| Endpoint | Limit | Window |
|----------|-------|--------|
| Login | 5 attempts | 15 minutes |
| Registration | 3 attempts | 1 hour |
| Password Reset | 3 attempts | 1 hour |
| General Auth | 20 requests | 1 minute |

## Environment-Specific Configuration

### Development
```env
NODE_ENV=development
AUTH_SECRET=<random-secret-key>
APP_URL=http://localhost:3000
WEB_URL=http://localhost:5173
```

**Cookie Settings**:
- `secure: false` (allows HTTP)
- `sameSite: none` (allows cross-origin)

### Production
```env
NODE_ENV=production
AUTH_SECRET=<strong-random-secret-key>
APP_URL=https://api.yourdomain.com
WEB_URL=https://yourdomain.com
```

**Cookie Settings**:
- `secure: true` (requires HTTPS)
- `sameSite: none` or `lax` (depending on domain setup)
- Consider setting `domain: .yourdomain.com` for subdomain support

## Best Practices

1. **Always use HTTPS in production**
   - Set `secure: true` for production
   - Obtain valid SSL/TLS certificates

2. **Use strong session secrets**
   - Generate random, cryptographically secure secrets
   - Rotate secrets periodically
   - Never commit secrets to version control

3. **Monitor authentication attempts**
   - Log failed login attempts
   - Alert on suspicious patterns
   - Review rate limit violations

4. **Regular security audits**
   - Review cookie configuration
   - Update dependencies regularly
   - Test authentication flows

5. **Consider same-domain deployment**
   - If possible, serve API and Web from same domain
   - Allows stricter `sameSite` settings
   - Reduces CSRF attack surface

## Troubleshooting

### Cookies not being set
- Check `secure` flag matches protocol (HTTPS/HTTP)
- Verify `sameSite: none` requires `secure: true`
- Check browser console for cookie warnings

### Session not persisting
- Verify cookie expiration settings
- Check server-side session validation
- Ensure cookies are not blocked by browser

### CORS issues
- Verify `credentials: true` in CORS configuration
- Check allowed origins match request origin
- Ensure `Access-Control-Allow-Credentials` header is set

### Cross-origin authentication fails
- Verify `sameSite: none` is set
- Ensure `secure: true` in production
- Check `partitioned: true` for modern browsers

## References

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [MDN: Using HTTP cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
- [Better-auth Documentation](https://better-auth.com)
- [CHIPS (Cookies Having Independent Partitioned State)](https://developers.google.com/privacy-sandbox/3pcd/chips)

