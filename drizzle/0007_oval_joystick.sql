CREATE TABLE "auto_promotion_analytics" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"promotion_id" varchar(36) NOT NULL,
	"date" date NOT NULL,
	"hour" integer,
	"views" integer DEFAULT 0,
	"applications" integer DEFAULT 0,
	"total_discount_amount" integer DEFAULT 0,
	"total_orders" integer DEFAULT 0,
	"total_revenue" integer DEFAULT 0,
	"conversion_rate" numeric(5, 4),
	"average_order_value" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_promotion_rules" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"promotion_id" varchar(36) NOT NULL,
	"rule_type" varchar(50) NOT NULL,
	"condition_type" varchar(50),
	"operator" varchar(10),
	"numeric_value" numeric(10, 2),
	"text_value" varchar(500),
	"json_value" jsonb,
	"benefit_type" varchar(50),
	"benefit_value" numeric(10, 2),
	"max_discount_amount" integer,
	"applicable_product_ids" jsonb,
	"applicable_category_ids" jsonb,
	"gift_product_ids" jsonb,
	"gift_quantities" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_promotion_usage" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"promotion_id" varchar(36) NOT NULL,
	"order_id" varchar(36) NOT NULL,
	"customer_id" varchar(36),
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"free_gifts" jsonb,
	"cart_subtotal" integer NOT NULL,
	"promotion_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_promotions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"type" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"usage_limit" integer,
	"usage_limit_per_customer" integer DEFAULT 1,
	"current_usage_count" integer DEFAULT 0,
	"exclusive_with" jsonb,
	"created_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "promotion_discount_amount" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "is_promotional_gift" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "source_promotion_id" varchar(36);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "applied_promotions" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promotion_discount_amount" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "auto_promotion_analytics" ADD CONSTRAINT "auto_promotion_analytics_promotion_id_auto_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."auto_promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_promotion_rules" ADD CONSTRAINT "auto_promotion_rules_promotion_id_auto_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."auto_promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_promotion_usage" ADD CONSTRAINT "auto_promotion_usage_promotion_id_auto_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."auto_promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_promotion_usage" ADD CONSTRAINT "auto_promotion_usage_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_promotion_usage" ADD CONSTRAINT "auto_promotion_usage_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_promotions" ADD CONSTRAINT "auto_promotions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_promotion_analytics_unique_idx" ON "auto_promotion_analytics" USING btree ("promotion_id","date","hour");--> statement-breakpoint
CREATE INDEX "auto_promotion_analytics_date_idx" ON "auto_promotion_analytics" USING btree ("date");--> statement-breakpoint
CREATE INDEX "auto_promotion_analytics_promotion_idx" ON "auto_promotion_analytics" USING btree ("promotion_id");--> statement-breakpoint
CREATE INDEX "auto_promotion_rules_promotion_type_idx" ON "auto_promotion_rules" USING btree ("promotion_id","rule_type");--> statement-breakpoint
CREATE INDEX "auto_promotion_rules_condition_type_idx" ON "auto_promotion_rules" USING btree ("condition_type");--> statement-breakpoint
CREATE INDEX "auto_promotion_rules_benefit_type_idx" ON "auto_promotion_rules" USING btree ("benefit_type");--> statement-breakpoint
CREATE INDEX "auto_promotion_usage_promotion_idx" ON "auto_promotion_usage" USING btree ("promotion_id");--> statement-breakpoint
CREATE INDEX "auto_promotion_usage_customer_idx" ON "auto_promotion_usage" USING btree ("customer_id","promotion_id");--> statement-breakpoint
CREATE INDEX "auto_promotion_usage_order_idx" ON "auto_promotion_usage" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "auto_promotion_usage_date_idx" ON "auto_promotion_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auto_promotions_status_idx" ON "auto_promotions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "auto_promotions_active_idx" ON "auto_promotions" USING btree ("status","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "auto_promotions_priority_idx" ON "auto_promotions" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "auto_promotions_type_idx" ON "auto_promotions" USING btree ("type");