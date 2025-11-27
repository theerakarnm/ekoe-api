# Customer Authentication Tests

This directory contains integration tests for the customer authentication system.

## Test Files

### Automated Tests

1. **auth-integration.test.ts** - Complete registration and login flow
   - Email/password registration
   - User and profile creation
   - Login with credentials
   - Protected route access
   - Duplicate email prevention

2. **checkout-auth.test.ts** - Checkout authentication requirements
   - Protected route enforcement
   - Profile data retrieval for pre-fill
   - Address management
   - Session validation
   - Order creation authentication

3. **password-reset.test.ts** - Password reset flow
   - Reset request handling
   - Token generation and validation
   - Password update
   - Login with new password
   - Token expiration and invalidation

4. **session-management.test.ts** - Session lifecycle
   - Session creation and persistence
   - Session validation
   - Session expiration handling
   - Logout and cleanup
   - Multiple concurrent sessions

### Manual Test Guides

5. **oauth-manual-test.md** - Google OAuth flow testing guide
   - Step-by-step OAuth testing
   - Profile creation verification
   - Email auto-verification
   - Account linking

6. **../../../.kiro/specs/customer-authentication/TESTING_GUIDE.md** - Comprehensive manual testing guide
   - All authentication flows
   - Cross-browser testing
   - Security verification
   - Troubleshooting guide

## Prerequisites

### Environment Setup

1. **Database**: PostgreSQL running with migrations applied
   ```bash
   cd api
   bun run db:migrate
   ```

2. **Environment Variables**: Configure `.env` file
   ```bash
   DATABASE_URL=postgresql://user:password@localhost:5432/dbname
   BETTER_AUTH_SECRET=your-secret-key
   BETTER_AUTH_URL=http://localhost:3000
   WEB_URL=http://localhost:5173
   ```

3. **API Server**: Running on port 3000
   ```bash
   cd api
   bun run dev
   ```

### Optional: Email Testing

For password reset and email verification tests:
```bash
# Add to .env
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your-mailtrap-user
SMTP_PASSWORD=your-mailtrap-password
SMTP_FROM=noreply@example.com
```

### Optional: Google OAuth Testing

For OAuth tests:
```bash
# Add to .env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

See `api/docs/GOOGLE_OAUTH_SETUP.md` for setup instructions.

## Running Tests

### Run All Tests
```bash
cd api
bun run test:all
```

### Run Individual Test Suites
```bash
# Registration and login
bun run test:auth

# Checkout authentication
bun run test:checkout

# Password reset
bun run test:password

# Session management
bun run test:session
```

### Run Specific Test File
```bash
bun test src/__test__/auth-integration.test.ts
```

### Run with Watch Mode
```bash
bun test --watch src/__test__/
```

## Test Coverage

### Task 18.1: Complete Registration Flow ✅
- ✅ Register new customer
- ✅ Verify email verification status
- ✅ Complete email verification (manual)
- ✅ Login with verified account
- ✅ Access protected routes

**Tests**: `auth-integration.test.ts`

### Task 18.2: Google OAuth Flow ✅
- ✅ Initiate Google sign-in (manual)
- ✅ Complete OAuth authorization (manual)
- ✅ Verify profile creation (manual)
- ✅ Verify email marked as verified (manual)

**Tests**: `oauth-manual-test.md`

### Task 18.3: Checkout Authentication ✅
- ✅ Add items to cart as guest (manual/web)
- ✅ Navigate to checkout (manual/web)
- ✅ Verify redirect to login (manual/web)
- ✅ Complete authentication
- ✅ Verify return to checkout with cart preserved (manual/web)

**Tests**: `checkout-auth.test.ts` + manual web testing

### Task 18.4: Password Reset Flow ✅
- ✅ Request password reset
- ✅ Receive email (manual if SMTP configured)
- ✅ Click reset link (manual)
- ✅ Set new password
- ✅ Login with new password

**Tests**: `password-reset.test.ts`

### Task 18.5: Session Management ✅
- ✅ Verify session persistence across page refreshes (manual/web)
- ✅ Verify session restoration after browser close (manual/web)
- ✅ Verify logout clears session
- ✅ Verify expired session handling

**Tests**: `session-management.test.ts`

## Test Data Cleanup

All automated tests clean up their test data in the `afterAll` hook:
- User records
- Customer profiles
- Sessions
- Addresses
- Verification tokens

Test users are created with unique email addresses using timestamps to avoid conflicts.

## Troubleshooting

### Tests Fail to Connect to Database

**Error**: `Connection refused` or `ECONNREFUSED`

**Solution**:
1. Verify PostgreSQL is running
2. Check `DATABASE_URL` in `.env`
3. Ensure database exists and migrations are applied

### Tests Fail with 404 Errors

**Error**: `404 Not Found` on API endpoints

**Solution**:
1. Ensure API server is running (`bun run dev`)
2. Verify `BETTER_AUTH_URL` matches API server URL
3. Check that routes are properly registered

### Session Tests Fail

**Error**: Session validation fails unexpectedly

**Solution**:
1. Clear any existing sessions in database
2. Restart API server
3. Verify `BETTER_AUTH_SECRET` is set
4. Check cookie configuration in `auth.ts`

### Password Reset Tests Fail

**Error**: Token not found or expired

**Solution**:
1. Check `verifications` table exists
2. Verify better-auth is configured correctly
3. Ensure email service is configured (or check logs for URLs)

## Manual Testing

For comprehensive manual testing, including:
- Web UI flows
- Cross-browser testing
- Mobile testing
- Cart preservation
- OAuth flows

See: `.kiro/specs/customer-authentication/TESTING_GUIDE.md`

## CI/CD Integration

To run tests in CI/CD pipeline:

```yaml
# Example GitHub Actions workflow
- name: Run Database Migrations
  run: cd api && bun run db:migrate

- name: Run Authentication Tests
  run: cd api && bun run test:all
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    BETTER_AUTH_SECRET: ${{ secrets.BETTER_AUTH_SECRET }}
    BETTER_AUTH_URL: http://localhost:3000
    WEB_URL: http://localhost:5173
```

## Test Metrics

Expected test execution times:
- `auth-integration.test.ts`: ~2-3 seconds
- `checkout-auth.test.ts`: ~3-4 seconds
- `password-reset.test.ts`: ~2-3 seconds
- `session-management.test.ts`: ~4-5 seconds

Total: ~12-15 seconds for all automated tests

## Contributing

When adding new authentication features:

1. Add corresponding test cases
2. Update this README
3. Update the main TESTING_GUIDE.md
4. Ensure tests clean up their data
5. Use unique identifiers (timestamps) for test data

## Support

For issues or questions:
- Check the troubleshooting section
- Review the comprehensive testing guide
- Check API logs for detailed error messages
- Verify environment configuration
