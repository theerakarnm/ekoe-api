export const config = {
  port: Number(process.env.PORT) || 3000,
  database: {
    url: process.env.DATABASE_URL || '',
  },
  auth: {
    secret: process.env.BETTER_AUTH_SECRET || 'default-secret',
    url: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
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
};

// Export payment configuration module
export * from './payment.config';
