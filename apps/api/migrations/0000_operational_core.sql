CREATE TABLE "admission" (
	"token_id" uuid PRIMARY KEY NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"at_ms" bigint NOT NULL,
	"method" text NOT NULL,
	"command_seq" bigint NOT NULL,
	CONSTRAINT "admission_method" CHECK ("admission"."method" IN ('NUMBER', 'REF'))
);
--> statement-breakpoint
CREATE TABLE "airport" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"time_zone" text NOT NULL,
	"data_classification" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "airport_org_code" UNIQUE("org_id","code")
);
--> statement-breakpoint
CREATE TABLE "checkpoint" (
	"id" uuid PRIMARY KEY NOT NULL,
	"airport_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"ticket_prefix" text NOT NULL,
	"lock_key" bigint GENERATED ALWAYS AS IDENTITY (sequence name "checkpoint_lock_key_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"day_starts_at" text DEFAULT '03:00' NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkpoint_airport_code" UNIQUE("airport_id","code"),
	CONSTRAINT "checkpoint_lock_key" UNIQUE("lock_key"),
	CONSTRAINT "checkpoint_ticket_prefix" CHECK ("checkpoint"."ticket_prefix" ~ '^[A-Z]{1,3}$'),
	CONSTRAINT "checkpoint_day_starts_at" CHECK ("checkpoint"."day_starts_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE TABLE "flight" (
	"id" uuid PRIMARY KEY NOT NULL,
	"airport_id" uuid NOT NULL,
	"service_date" date NOT NULL,
	"number" text NOT NULL,
	"std_ms" bigint NOT NULL,
	"boarding_close_ms" bigint,
	"deadline_source" text NOT NULL,
	"observed_at_ms" bigint,
	"gate_zone" text NOT NULL,
	"walk_estimate_ms" integer NOT NULL,
	"environment" text NOT NULL,
	CONSTRAINT "flight_airport_date_number" UNIQUE("airport_id","service_date","number"),
	CONSTRAINT "flight_deadline_source" CHECK ("flight"."deadline_source" IN ('FEED', 'RULE', 'NONE')),
	CONSTRAINT "flight_deadline_known" CHECK (("flight"."deadline_source" = 'NONE') = ("flight"."boarding_close_ms" IS NULL)),
	CONSTRAINT "flight_environment" CHECK ("flight"."environment" IN ('LIVE', 'SIMULATED', 'DEMO')),
	CONSTRAINT "flight_walk" CHECK ("flight"."walk_estimate_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_command" (
	"checkpoint_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"service_day" date NOT NULL,
	"type" text NOT NULL,
	"at_ms" bigint NOT NULL,
	"command" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"actor" text NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "queue_command_pkey" PRIMARY KEY("checkpoint_id","seq"),
	CONSTRAINT "queue_command_idempotency" UNIQUE("checkpoint_id","idempotency_key"),
	CONSTRAINT "queue_command_seq" CHECK ("queue_command"."seq" >= 1),
	CONSTRAINT "queue_command_hash" CHECK ("queue_command"."hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "queue_event" (
	"checkpoint_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"command_seq" bigint NOT NULL,
	"type" text NOT NULL,
	"at_ms" bigint NOT NULL,
	"ticket_id" uuid,
	"payload" jsonb NOT NULL,
	CONSTRAINT "queue_event_pkey" PRIMARY KEY("checkpoint_id","seq")
);
--> statement-breakpoint
CREATE TABLE "queue_token" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"service_day" date NOT NULL,
	"number" text NOT NULL,
	"opaque_ref" text NOT NULL,
	"source" text NOT NULL,
	"flight_id" uuid NOT NULL,
	"segment" text NOT NULL,
	"party_size" integer NOT NULL,
	"state" text NOT NULL,
	"risk_class" text NOT NULL,
	"priority" boolean NOT NULL,
	"calls" integer NOT NULL,
	"issued_at_ms" bigint NOT NULL,
	"first_called_at_ms" bigint,
	"admitted_at_ms" bigint,
	"updated_seq" bigint NOT NULL,
	CONSTRAINT "queue_token_number" UNIQUE("checkpoint_id","service_day","number"),
	CONSTRAINT "queue_token_opaque_ref" UNIQUE("opaque_ref"),
	CONSTRAINT "queue_token_party_size" CHECK ("queue_token"."party_size" BETWEEN 1 AND 20),
	CONSTRAINT "queue_token_segment" CHECK ("queue_token"."segment" IN ('DEPARTING', 'TRANSFER')),
	CONSTRAINT "queue_token_source" CHECK ("queue_token"."source" IN ('STAFF', 'KIOSK')),
	CONSTRAINT "queue_token_state" CHECK ("queue_token"."state" IN ('QUEUED', 'PREPARE', 'CALLED', 'RECALLED', 'NO_SHOW', 'ADMITTED', 'EXPIRED'))
);
--> statement-breakpoint
ALTER TABLE "admission" ADD CONSTRAINT "admission_token_id_queue_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."queue_token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airport" ADD CONSTRAINT "airport_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoint" ADD CONSTRAINT "checkpoint_airport_id_airport_id_fk" FOREIGN KEY ("airport_id") REFERENCES "public"."airport"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight" ADD CONSTRAINT "flight_airport_id_airport_id_fk" FOREIGN KEY ("airport_id") REFERENCES "public"."airport"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_command" ADD CONSTRAINT "queue_command_checkpoint_id_checkpoint_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoint"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_event" ADD CONSTRAINT "queue_event_command" FOREIGN KEY ("checkpoint_id","command_seq") REFERENCES "public"."queue_command"("checkpoint_id","seq") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_token" ADD CONSTRAINT "queue_token_checkpoint_id_checkpoint_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoint"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queue_token" ADD CONSTRAINT "queue_token_flight_id_flight_id_fk" FOREIGN KEY ("flight_id") REFERENCES "public"."flight"("id") ON DELETE no action ON UPDATE no action;