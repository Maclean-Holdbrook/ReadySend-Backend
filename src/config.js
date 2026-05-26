import dotenv from 'dotenv';

dotenv.config();

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TOKEN_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const config = {
  port: Number(process.env.PORT || 4000),
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 4000}`,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  tokenSecret: process.env.TOKEN_SECRET,
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
  webAppUrl: process.env.WEB_APP_URL || 'http://localhost:5173',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
};
