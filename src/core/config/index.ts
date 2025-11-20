export const config = {
  port: Number(process.env.PORT) || 3000,
  database: {
    url: process.env.DATABASE_URL || '',
  },
  auth: {
    secret: process.env.AUTH_SECRET || 'default-secret',
  },
  env: process.env.NODE_ENV || 'development',
};
