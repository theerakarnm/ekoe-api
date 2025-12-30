ALTER TABLE "product_images" ADD COLUMN "media_type" varchar(20) DEFAULT 'image';--> statement-breakpoint
ALTER TABLE "discount_codes" ADD COLUMN "is_featured" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD COLUMN "linked_product_ids" jsonb;