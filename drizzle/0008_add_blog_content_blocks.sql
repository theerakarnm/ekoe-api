CREATE TYPE "public"."audit_entity_type" AS ENUM('promotion', 'promotion_rule', 'promotion_usage', 'security_event');--> statement-breakpoint
CREATE TYPE "public"."audit_event_type" AS ENUM('promotion_created', 'promotion_updated', 'promotion_deleted', 'promotion_activated', 'promotion_deactivated', 'promotion_paused', 'promotion_resumed', 'promotion_applied', 'promotion_usage_recorded', 'rule_created', 'rule_updated', 'rule_deleted', 'security_violation', 'suspicious_activity', 'high_value_promotion_applied', 'usage_limit_exceeded', 'calculation_validation_failed');--> statement-breakpoint
CREATE TYPE "public"."audit_severity" AS ENUM('info', 'warning', 'error', 'critical');--> statement-breakpoint
CREATE TABLE "auto_promotion_audit_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"event_type" "audit_event_type" NOT NULL,
	"promotion_id" varchar(36),
	"user_id" varchar(36),
	"customer_id" varchar(36),
	"entity_type" "audit_entity_type" NOT NULL,
	"entity_id" varchar(36),
	"old_values" jsonb,
	"new_values" jsonb,
	"metadata" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"session_id" varchar(128),
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"severity" "audit_severity" DEFAULT 'info' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "subtitle" varchar(500);--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "content_blocks" jsonb;--> statement-breakpoint
ALTER TABLE "blog_posts" ADD COLUMN "table_of_contents" jsonb;--> statement-breakpoint
ALTER TABLE "auto_promotion_audit_logs" ADD CONSTRAINT "auto_promotion_audit_logs_promotion_id_auto_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."auto_promotions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_promotion_audit_logs" ADD CONSTRAINT "auto_promotion_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_promotion_audit_logs" ADD CONSTRAINT "auto_promotion_audit_logs_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_promotion_audit_logs_event_type_idx" ON "auto_promotion_audit_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "auto_promotion_audit_logs_promotion_idx" ON "auto_promotion_audit_logs" USING btree ("promotion_id");--> statement-breakpoint
CREATE INDEX "auto_promotion_audit_logs_user_idx" ON "auto_promotion_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auto_promotion_audit_logs_customer_idx" ON "auto_promotion_audit_logs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "auto_promotion_audit_logs_timestamp_idx" ON "auto_promotion_audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "auto_promotion_audit_logs_severity_idx" ON "auto_promotion_audit_logs" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "auto_promotion_audit_logs_entity_type_idx" ON "auto_promotion_audit_logs" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "auto_promotion_audit_logs_entity_idx" ON "auto_promotion_audit_logs" USING btree ("entity_type","entity_id");