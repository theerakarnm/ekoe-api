-- Add additional product detail fields to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS ingredients jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS how_to_use jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS complimentary_gift jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS good_for text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS why_it_works text;
