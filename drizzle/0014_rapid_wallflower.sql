ALTER TABLE "auto_promotion_rules" ADD COLUMN "gift_name" varchar(255);--> statement-breakpoint
ALTER TABLE "auto_promotion_rules" ADD COLUMN "gift_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "auto_promotion_rules" ADD COLUMN "gift_image_url" text;--> statement-breakpoint
ALTER TABLE "auto_promotion_rules" ADD COLUMN "gift_quantity" integer;