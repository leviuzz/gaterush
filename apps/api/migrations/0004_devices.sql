CREATE TABLE "device" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "device_token_hash" UNIQUE("token_hash"),
	CONSTRAINT "device_kind" CHECK ("device"."kind" IN ('KIOSK', 'DISPLAY', 'LANE')),
	CONSTRAINT "device_token_hash_hex" CHECK ("device"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_checkpoint_id_checkpoint_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoint"("id") ON DELETE no action ON UPDATE no action;