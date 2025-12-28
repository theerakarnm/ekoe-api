export const config = {
  port: Number(process.env.PORT) || 3000,
  database: {
    url: process.env.DATABASE_URL || '',
  },
  auth: {
    secret: process.env.BETTER_AUTH_SECRET || 'default-secret',
    url: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    cookieDomain: process.env.COOKIE_DOMAIN || undefined, // e.g., '.theerakarnm.dev' for subdomain support
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },
  facebook: {
    clientId: process.env.FACEBOOK_CLIENT_ID || '',
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET || '',
  },
  line: {
    clientId: process.env.LINE_CLIENT_ID || '',
    clientSecret: process.env.LINE_CLIENT_SECRET || '',
  },
  email: {
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT) || 587,
      user: process.env.SMTP_USER || '',
      password: process.env.SMTP_PASSWORD || '',
    },
    from: process.env.SMTP_FROM || 'noreply@example.com',
  },
  web: {
    url: process.env.WEB_URL || 'http://localhost:5173',
  },
  env: process.env.NODE_ENV || 'development',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ["Content-Type", "Authorization", "User-Agent", "Accept", "Origin", "X-Requested-With"],
    credentials: true,
  }
};

// Export payment configuration module
export * from './payment.config';
