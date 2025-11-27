# Google OAuth Setup Guide

This guide walks you through setting up Google OAuth authentication for customer login in the e-commerce application.

## Prerequisites

- A Google account
- Access to [Google Cloud Console](https://console.cloud.google.com/)

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top of the page
3. Click "New Project"
4. Enter a project name (e.g., "Ekoe E-commerce")
5. Click "Create"

## Step 2: Enable Google+ API

1. In your project, navigate to "APIs & Services" > "Library"
2. Search for "Google+ API"
3. Click on "Google+ API"
4. Click "Enable"

## Step 3: Configure OAuth Consent Screen

1. Navigate to "APIs & Services" > "OAuth consent screen"
2. Select "External" user type (unless you have a Google Workspace)
3. Click "Create"
4. Fill in the required information:
   - **App name**: Your application name (e.g., "Ekoe E-commerce")
   - **User support email**: Your support email
   - **Developer contact information**: Your email
5. Click "Save and Continue"
6. On the "Scopes" page, click "Add or Remove Scopes"
7. Add the following scopes:
   - `openid`
   - `email`
   - `profile`
8. Click "Update" and then "Save and Continue"
9. On the "Test users" page (for development), add test user emails if needed
10. Click "Save and Continue"
11. Review the summary and click "Back to Dashboard"

## Step 4: Create OAuth 2.0 Credentials

1. Navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Web application" as the application type
4. Enter a name (e.g., "Ekoe Web Client")
5. Add **Authorized JavaScript origins**:
   - Development: `http://localhost:5173`
   - Production: `https://yourdomain.com`
6. Add **Authorized redirect URIs**:
   - Development: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://api.yourdomain.com/api/auth/callback/google`
7. Click "Create"
8. Copy the **Client ID** and **Client Secret** (you'll need these for environment variables)

## Step 5: Configure Environment Variables

### API Environment Variables

Add the following to your `api/.env` file:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here

# Web Application URL (for CORS and redirects)
WEB_URL=http://localhost:5173
```

### Web Environment Variables

Add the following to your `web/.env` file:

```bash
# Google OAuth
VITE_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
```

**Note**: The `VITE_GOOGLE_CLIENT_ID` should be the same as `GOOGLE_CLIENT_ID` from the API.

## Step 6: Verify Configuration

1. Start your API server:
   ```bash
   cd api
   bun run dev
   ```

2. Start your web application:
   ```bash
   cd web
   bun run dev
   ```

3. Navigate to the login page: `http://localhost:5173/auth/login`
4. Click the "Sign in with Google" button
5. You should be redirected to Google's OAuth consent screen
6. After authorizing, you should be redirected back to your application

## Required OAuth Scopes

The application requires the following OAuth scopes:

- **openid**: Required for OpenID Connect authentication
- **email**: Access to user's email address
- **profile**: Access to user's basic profile information (name, picture)

These scopes are automatically requested by better-auth when using the Google provider.

## Redirect URIs

The OAuth flow uses the following redirect URI pattern:

```
{BETTER_AUTH_URL}/api/auth/callback/google
```

Where `BETTER_AUTH_URL` is your API base URL:
- Development: `http://localhost:3000`
- Production: `https://api.yourdomain.com`

Make sure this URI is added to your Google OAuth client's authorized redirect URIs.

## Troubleshooting

### Error: redirect_uri_mismatch

This error occurs when the redirect URI in your OAuth request doesn't match the authorized redirect URIs in your Google Cloud Console.

**Solution**: 
1. Check that the redirect URI in Google Cloud Console matches exactly: `http://localhost:3000/api/auth/callback/google`
2. Ensure there are no trailing slashes
3. Verify the protocol (http vs https) matches

### Error: invalid_client

This error occurs when the client ID or client secret is incorrect.

**Solution**:
1. Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your `.env` file
2. Ensure there are no extra spaces or quotes
3. Regenerate credentials if necessary

### Error: access_denied

This error occurs when the user denies permission or the OAuth consent screen is not properly configured.

**Solution**:
1. Ensure the OAuth consent screen is published (or add test users for development)
2. Verify all required scopes are configured
3. Check that the user's email is added as a test user (if in testing mode)

### CORS Errors

If you see CORS errors when initiating OAuth:

**Solution**:
1. Verify `WEB_URL` is set correctly in `api/.env`
2. Check that your web application URL is added to "Authorized JavaScript origins" in Google Cloud Console
3. Ensure CORS is properly configured in your API (better-auth handles this automatically)

## Security Best Practices

1. **Never commit credentials**: Keep `.env` files out of version control
2. **Use environment-specific credentials**: Use different OAuth clients for development and production
3. **Rotate secrets regularly**: Periodically regenerate your client secret
4. **Limit scopes**: Only request the minimum scopes needed for your application
5. **Monitor usage**: Regularly check the Google Cloud Console for unusual activity
6. **Use HTTPS in production**: Always use HTTPS for production OAuth flows

## Production Deployment

When deploying to production:

1. Create a new OAuth client ID for production (or update existing one)
2. Add production URLs to authorized origins and redirect URIs
3. Update environment variables with production values
4. Ensure `BETTER_AUTH_URL` points to your production API
5. Ensure `WEB_URL` points to your production web application
6. Verify SSL certificates are valid
7. Test the complete OAuth flow in production

## Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Better-auth Google Provider Documentation](https://www.better-auth.com/docs/authentication/social)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
