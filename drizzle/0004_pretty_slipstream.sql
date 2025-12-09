ALTER TABLE "products" ADD COLUMN "ingredients" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "how_to_use" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "complimentary_gift" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "good_for" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "why_it_works" text;