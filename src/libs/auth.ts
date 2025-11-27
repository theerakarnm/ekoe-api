import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { config } from "../core/config";
import { db } from "../core/database";
import * as schema from "../core/database/schema";
import { logger } from "../core/logger";
import { emailService } from "../core/email";
import { customersDomain } from "../features/customers/customers.domain";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema
    },
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendVerificationEmail: async ({ user, url }: { user: any; url: string }) => {
      // Send email verification email
      logger.info({ userId: user.id, email: user.email }, 'Email verification requested');
      
      if (emailService.isEnabled()) {
        const sent = await emailService.sendVerificationEmail(
          user.email,
          user.name || 'Customer',
          url
        );
        
        if (sent) {
          logger.info({ userId: user.id, email: user.email }, 'Verification email sent successfully');
        } else {
          logger.error({ userId: user.id, email: user.email }, 'Failed to send verification email');
        }
      } else {
        logger.warn('SMTP not configured, verification email not sent');
        logger.info({ verificationUrl: url }, 'Verification URL (dev mode)');
      }
    },
    sendResetPassword: async ({ user, url }: { user: any; url: string }) => {
      // Send password reset email
      logger.info({ userId: user.id, email: user.email }, 'Password reset requested');
      
      if (emailService.isEnabled()) {
        const sent = await emailService.sendPasswordResetEmail(
          user.email,
          user.name || 'Customer',
          url
        );
        
        if (sent) {
          logger.info({ userId: user.id, email: user.email }, 'Password reset email sent successfully');
        } else {
          logger.error({ userId: user.id, email: user.email }, 'Failed to send password reset email');
        }
      } else {
        logger.warn('SMTP not configured, password reset email not sent');
        logger.info({ resetUrl: url }, 'Password reset URL (dev mode)');
      }
    },
  },
  socialProviders: {
    google: {
      clientId: config.google.clientId,
      clientSecret: config.google.clientSecret,
      enabled: !!config.google.clientId && !!config.google.clientSecret,
    },
  },
  plugins: [
    admin()
  ],
  trustedOrigins: [config.web.url],
  secret: config.auth.secret,
  baseURL: config.auth.url,
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days in seconds
    updateAge: 60 * 60 * 24, // Update session every 24 hours (1 day in seconds)
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // Cache for 5 minutes
    },
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: true
    },
    defaultCookieAttributes: {
      sameSite: "none",
      secure: config.env === 'production',
      httpOnly: true, // Prevent XSS attacks
      partitioned: true, // New browser standards will mandate this for foreign cookies
      maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
    }
  }
});

/**
 * Helper function to create customer profile after user registration
 * Called from auth routes after successful authentication
 */
export async function createCustomerProfileAfterAuth(userId: string, name?: string | null) {
  try {
    // Parse name into first and last name
    const nameParts = name?.split(' ') || [];
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    await customersDomain.getOrCreateProfile(userId, {
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      newsletterSubscribed: false,
      smsSubscribed: false,
      language: 'th',
    });

    logger.info({ userId }, 'Customer profile created/verified after authentication');
  } catch (error) {
    // Log error but don't fail the authentication
    logger.error({ userId, error }, 'Failed to create customer profile after authentication');
  }
}
