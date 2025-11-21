import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { config } from "../core/config";
import { db } from "../core/database";
import * as schema from "../core/database/schema";

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
  },
  plugins: [
    admin()
  ],
  trustedOrigins: ['http://localhost:5173'],
  secret: config.auth.secret,
  advanced: {
    crossSubDomainCookies: {
      enabled: true
    }
  }
});
