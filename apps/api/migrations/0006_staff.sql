CREATE TABLE "staff_session" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at_ms" bigint NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "staff_session_token_hash" CHECK ("staff_session"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "staff_user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"airport_id" uuid NOT NULL,
	"login" text NOT NULL,
	"role" text NOT NULL,
	"checkpoint_ids" uuid[],
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "staff_user_login" UNIQUE("login"),
	CONSTRAINT "staff_user_role" CHECK ("staff_user"."role" IN ('OPERATOR', 'SUPERVISOR', 'ADMIN')),
	CONSTRAINT "staff_user_login_format" CHECK ("staff_user"."login" ~ '^[a-z0-9][a-z0-9._-]{2,62}$'),
	CONSTRAINT "staff_user_password_hash" CHECK ("staff_user"."password_hash" LIKE 'scrypt$%')
);
--> statement-breakpoint
ALTER TABLE "staff_session" ADD CONSTRAINT "staff_session_user_id_staff_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_user" ADD CONSTRAINT "staff_user_airport_id_airport_id_fk" FOREIGN KEY ("airport_id") REFERENCES "public"."airport"("id") ON DELETE no action ON UPDATE no action;