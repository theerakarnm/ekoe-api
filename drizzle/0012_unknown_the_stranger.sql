CREATE TYPE "public"."contact_status" AS ENUM('unread', 'read', 'responded');--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"topic" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"status" "contact_status" DEFAULT 'unread' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
