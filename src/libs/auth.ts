import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { config } from "../core/config";
import { db } from "../core/database";
import * as schema from "../core/database/schema";
import { logger } from "../core/logger";

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
    sendResetPassword: async ({ user, url }) => {
      // Send password reset email
      logger.info({ userId: user.id, email: user.email }, 'Password reset requested');
      
      // TODO: Implement actual email sending when SMTP is configured
      if (config.email.smtp.host) {
        logger.info({ resetUrl: url }, 'Password reset email would be sent');
        // Email sending implementation will be added in task 12
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
  advanced: {
    crossSubDomainCookies: {
      enabled: true
    },
    defaultCookieAttributes: {
      sameSite: "none",
      secure: config.env === 'production',
      partitioned: true // New browser standards will mandate this for foreign cookies
    }
  }
});
