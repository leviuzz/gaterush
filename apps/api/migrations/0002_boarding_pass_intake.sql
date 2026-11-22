CREATE TABLE "dedup_secret" (
	"airport_id" uuid NOT NULL,
	"flight_date" date NOT NULL,
	"secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dedup_secret_pkey" PRIMARY KEY("airport_id","flight_date"),
	CONSTRAINT "dedup_secret_hex" CHECK ("dedup_secret"."secret" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "scan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"at_ms" bigint NOT NULL,
	"outcome" text NOT NULL,
	"reason" text,
	"ticket_id" uuid,
	"bcbp_version" integer,
	"legs" integer,
	"security_data" boolean,
	CONSTRAINT "scan_outcome" CHECK ("scan"."outcome" IN ('ISSUED', 'RETRIEVED', 'REJECTED', 'NEEDS_ASSISTANCE'))
);
--> statement-breakpoint
ALTER TABLE "airport" ADD COLUMN "iata" text DEFAULT 'ZZZ' NOT NULL;--> statement-breakpoint
ALTER TABLE "flight" ADD COLUMN "carrier" text;--> statement-breakpoint
ALTER TABLE "flight" ADD COLUMN "flight_number" text;--> statement-breakpoint
ALTER TABLE "flight" ADD COLUMN "departure_date" date;--> statement-breakpoint
ALTER TABLE "queue_token" ADD COLUMN "dedup_key" text;--> statement-breakpoint
ALTER TABLE "dedup_secret" ADD CONSTRAINT "dedup_secret_airport_id_airport_id_fk" FOREIGN KEY ("airport_id") REFERENCES "public"."airport"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_checkpoint_id_checkpoint_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoint"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "queue_token_dedup_active" ON "queue_token" USING btree ("checkpoint_id","dedup_key") WHERE "queue_token"."dedup_key" IS NOT NULL AND "queue_token"."state" NOT IN ('ADMITTED', 'EXPIRED');--> statement-breakpoint
ALTER TABLE "flight" ADD CONSTRAINT "flight_carrier_number" UNIQUE("airport_id","departure_date","carrier","flight_number");--> statement-breakpoint
ALTER TABLE "airport" ADD CONSTRAINT "airport_iata" CHECK ("airport"."iata" ~ '^[A-Z]{3}$');