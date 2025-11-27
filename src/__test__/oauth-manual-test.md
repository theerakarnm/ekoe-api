# Google OAuth Manual Testing Guide

This guide provides step-by-step instructions for manually testing the Google OAuth flow. OAuth requires browser interaction and cannot be fully automated.

## Prerequisites

1. **Google OAuth Credentials Configured**:
   - `GOOGLE_CLIENT_ID` set in `api/.env`
   - `GOOGLE_CLIENT_SECRET` set in `api/.env`
   - `VITE_GOOGLE_CLIENT_ID` set in `web/.env`

2. **Servers Running**:
   ```bash
   # Terminal 1 - API
   cd api && bun run dev
   
   # Terminal 2 - Web
   cd web && bun run dev
   ```

3. **Database Ready**:
   ```bash
   cd api && bun run db:migrate
   ```

## Test 18.2: Google OAuth Flow

### Step 1: Initiate Google Sign-In

1. Open browser to `http://localhost:5173/auth/login`
2. Open browser DevTools (F12)
3. Go to Network tab
4. Click "Continue with Google" button

**Verify**:
- ✅ Network request to `/api/auth/sign-in/social` initiated
- ✅ Redirected to `accounts.google.com`
- ✅ URL contains `client_id` parameter
- ✅ URL contains `state` parameter (CSRF protection)
- ✅ URL contains `redirect_uri` parameter

**Example URL**:
```
https://accounts.google.com/o/oauth2/v2/auth?
  client_id=YOUR_CLIENT_ID&
  redirect_uri=http://localhost:3000/api/auth/callback/google&
  response_type=code&
  scope=openid+email+profile&
  state=RANDOM_STATE_TOKEN
```

### Step 2: Complete OAuth Authorization

1. Select Google account (or login if needed)
2. Review permissions requested
3. Click "Continue" or "Allow"
4. Wait for redirect

**Verify**:
- ✅ Permissions screen shows correct app name
- ✅ Permissions include: email, profile, openid
- ✅ After authorization, redirected back to application
- ✅ Redirect URL: `http://localhost:3000/api/auth/callback/google?code=...&state=...`

### Step 3: Verify Profile Creation

1. After redirect, check you're logged in
2. Check browser DevTools > Application > Cookies
3. Verify session cookie is set

**Database Verification**:
```sql
-- Find user by Google email
SELECT id, email, name, "emailVerified" 
FROM users 
WHERE email = 'your-google-email@gmail.com';

-- Verify email is marked as verified
-- emailVerified should be TRUE

-- Check customer profile was created
SELECT * 
FROM customer_profiles 
WHERE "userId" = '<user-id-from-above>';

-- Verify OAuth account link
SELECT * 
FROM accounts 
WHERE "userId" = '<user-id-from-above>' 
  AND "providerId" = 'google';
```

**Expected Database State**:
- ✅ User record exists with Google email
- ✅ `emailVerified` = `true`
- ✅ Customer profile exists with name from Google
- ✅ Account record links user to Google provider
- ✅ `providerId` = 'google'
- ✅ `accountId` contains Google user ID

### Step 4: Verify Email Marked as Verified

1. Check user record in database
2. Verify `emailVerified` field is `true`
3. Try to access protected routes (should work immediately)

**Verification**:
```sql
SELECT "emailVerified" 
FROM users 
WHERE email = 'your-google-email@gmail.com';
-- Should return: true
```

**UI Verification**:
- ✅ No email verification banner/message shown
- ✅ Can access checkout immediately
- ✅ Can access customer profile
- ✅ No verification email sent

### Step 5: Test Subsequent Logins

1. Sign out from application
2. Navigate to login page
3. Click "Continue with Google" again
4. Select same Google account

**Verify**:
- ✅ Logged in immediately (no new account created)
- ✅ Same user ID as before
- ✅ Profile data preserved
- ✅ No duplicate user records

**Database Verification**:
```sql
-- Should only have ONE user with this email
SELECT COUNT(*) 
FROM users 
WHERE email = 'your-google-email@gmail.com';
-- Should return: 1
```

### Step 6: Test Account Linking (Optional)

If you want to test linking Google to existing email/password account:

1. Create account with email/password using your Google email
2. Verify email
3. Sign out
4. Sign in with Google using same email

**Verify**:
- ✅ Accounts are linked (same user ID)
- ✅ Can sign in with either method
- ✅ Profile data merged

**Database Verification**:
```sql
-- Should have TWO account records for same user
SELECT * 
FROM accounts 
WHERE "userId" = '<user-id>';
-- Should show both 'credential' and 'google' providers
```

## Troubleshooting

### Error: "redirect_uri_mismatch"

**Cause**: Redirect URI not authorized in Google Console

**Fix**:
1. Go to Google Cloud Console
2. Navigate to OAuth 2.0 Client IDs
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Save and wait a few minutes

### Error: "invalid_client"

**Cause**: Client ID or Secret incorrect

**Fix**:
1. Verify `GOOGLE_CLIENT_ID` in `api/.env`
2. Verify `GOOGLE_CLIENT_SECRET` in `api/.env`
3. Ensure no extra spaces or quotes
4. Restart API server

### Error: OAuth callback fails

**Cause**: State parameter mismatch (CSRF protection)

**Fix**:
1. Clear browser cookies
2. Try again
3. Check API logs for detailed error

### User not redirected after OAuth

**Cause**: Callback URL configuration issue

**Fix**:
1. Check `BETTER_AUTH_URL` in `api/.env`
2. Verify `WEB_URL` in `api/.env`
3. Check `trustedOrigins` in `auth.ts`

## Success Criteria

All checks pass:
- ✅ OAuth flow initiates correctly
- ✅ Google consent screen appears
- ✅ User can authorize application
- ✅ Callback succeeds and user is logged in
- ✅ User record created in database
- ✅ Email marked as verified automatically
- ✅ Customer profile created with Google data
- ✅ Account record links to Google provider
- ✅ Session established correctly
- ✅ Subsequent logins work without creating duplicates
- ✅ CSRF protection (state parameter) works
- ✅ No security vulnerabilities
