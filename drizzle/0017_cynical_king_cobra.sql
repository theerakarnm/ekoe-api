CREATE TABLE "site_settings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"title" varchar(500) NOT NULL,
	"subtitle" varchar(500),
	"description" text,
	"hero_image_url" varchar(1000),
	"hero_image_mobile_url" varchar(1000),
	"logo_url" varchar(1000),
	"content_blocks" jsonb,
	"cta_text" varchar(100),
	"cta_url" varchar(1000),
	"is_active" boolean DEFAULT true,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "marketing_campaigns_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "sort_order" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "auto_promotion_rules" ADD COLUMN "gift_options" jsonb;--> statement-breakpoint
ALTER TABLE "auto_promotion_rules" ADD COLUMN "gift_selection_type" varchar(20) DEFAULT 'single';--> statement-breakpoint
ALTER TABLE "auto_promotion_rules" ADD COLUMN "max_gift_selections" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;