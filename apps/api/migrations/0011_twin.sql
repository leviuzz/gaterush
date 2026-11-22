CREATE TABLE "twin_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "twin_run_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"airport_id" uuid NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"scenario_id" text NOT NULL,
	"scenario_hash" text NOT NULL,
	"seed" integer NOT NULL,
	"policy_hash" text NOT NULL,
	"service_day" date NOT NULL,
	"origin_ms" bigint NOT NULL,
	"until_ms" bigint,
	"from_ms" bigint NOT NULL,
	"to_ms" bigint NOT NULL,
	"steps" integer NOT NULL,
	"expected_calls" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at_ms" bigint NOT NULL,
	"state" text NOT NULL,
	"speed" integer,
	"virtual_ms" bigint NOT NULL,
	"applied" integer DEFAULT 0 NOT NULL,
	"matched_calls" integer DEFAULT 0 NOT NULL,
	"divergence" jsonb,
	"error" text,
	"updated_at_ms" bigint NOT NULL,
	"ended_at_ms" bigint,
	CONSTRAINT "twin_run_checkpoint_id_unique" UNIQUE("checkpoint_id"),
	CONSTRAINT "twin_run_state" CHECK ("twin_run"."state" IN ('RUNNING', 'STOPPED', 'FINISHED', 'DIVERGED', 'FAILED')),
	CONSTRAINT "twin_run_speed" CHECK ("twin_run"."speed" IS NULL OR "twin_run"."speed" >= 1)
);
--> statement-breakpoint
ALTER TABLE "flight" DROP CONSTRAINT "flight_airport_date_number";--> statement-breakpoint
ALTER TABLE "flight" DROP CONSTRAINT "flight_carrier_number";--> statement-breakpoint
ALTER TABLE "queue_token" DROP CONSTRAINT "queue_token_source";--> statement-breakpoint
ALTER TABLE "flight" ADD COLUMN "twin_run_id" uuid;--> statement-breakpoint
ALTER TABLE "twin_run" ADD CONSTRAINT "twin_run_airport_id_airport_id_fk" FOREIGN KEY ("airport_id") REFERENCES "public"."airport"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twin_run" ADD CONSTRAINT "twin_run_checkpoint_id_checkpoint_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoint"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "twin_run_airport" ON "twin_run" USING btree ("airport_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "twin_run_one_running" ON "twin_run" USING btree ("airport_id") WHERE "twin_run"."state" = 'RUNNING';--> statement-breakpoint
ALTER TABLE "flight" ADD CONSTRAINT "flight_twin_run_id_twin_run_id_fk" FOREIGN KEY ("twin_run_id") REFERENCES "public"."twin_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flight_airport_date_number" ON "flight" USING btree ("airport_id","service_date","number") WHERE "flight"."twin_run_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "flight_carrier_number" ON "flight" USING btree ("airport_id","departure_date","carrier","flight_number") WHERE "flight"."twin_run_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "flight_twin_number" ON "flight" USING btree ("twin_run_id","number") WHERE "flight"."twin_run_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "flight" ADD CONSTRAINT "flight_twin_simulated" CHECK ("flight"."twin_run_id" IS NULL OR "flight"."environment" = 'SIMULATED');--> statement-breakpoint
ALTER TABLE "queue_token" ADD CONSTRAINT "queue_token_source" CHECK ("queue_token"."source" IN ('STAFF', 'KIOSK', 'TWIN'));