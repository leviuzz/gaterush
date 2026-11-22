CREATE TABLE "sim_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "sim_run_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"airport_id" uuid NOT NULL,
	"scenario_ref" uuid NOT NULL,
	"label" text,
	"request" json NOT NULL,
	"state" text NOT NULL,
	"days_total" integer NOT NULL,
	"days_done" integer DEFAULT 0 NOT NULL,
	"results" text,
	"results_hash" text,
	"fingerprint" text,
	"reproduces" uuid,
	"expected_fingerprint" text,
	"matches" boolean,
	"error" text,
	"created_by" text NOT NULL,
	"created_at_ms" bigint NOT NULL,
	"started_at_ms" bigint,
	"ended_at_ms" bigint,
	"updated_at_ms" bigint NOT NULL,
	"runner" text,
	CONSTRAINT "sim_run_state" CHECK ("sim_run"."state" IN ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED')),
	CONSTRAINT "sim_run_days" CHECK ("sim_run"."days_done" >= 0 AND "sim_run"."days_done" <= "sim_run"."days_total"),
	CONSTRAINT "sim_run_done" CHECK (("sim_run"."state" = 'DONE') = ("sim_run"."results" IS NOT NULL AND "sim_run"."fingerprint" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "sim_scenario" (
	"id" uuid PRIMARY KEY NOT NULL,
	"airport_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"scenario_id" text NOT NULL,
	"title" text NOT NULL,
	"data_classification" text NOT NULL,
	"content" text NOT NULL,
	"created_at_ms" bigint NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "sim_scenario_hash" UNIQUE("airport_id","hash"),
	CONSTRAINT "sim_scenario_hash_format" CHECK ("sim_scenario"."hash" ~ '^sha256:[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "staff_user" DROP CONSTRAINT "staff_user_role";--> statement-breakpoint
ALTER TABLE "sim_run" ADD CONSTRAINT "sim_run_airport_id_airport_id_fk" FOREIGN KEY ("airport_id") REFERENCES "public"."airport"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_run" ADD CONSTRAINT "sim_run_scenario_ref_sim_scenario_id_fk" FOREIGN KEY ("scenario_ref") REFERENCES "public"."sim_scenario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_run" ADD CONSTRAINT "sim_run_reproduces_sim_run_id_fk" FOREIGN KEY ("reproduces") REFERENCES "public"."sim_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sim_scenario" ADD CONSTRAINT "sim_scenario_airport_id_airport_id_fk" FOREIGN KEY ("airport_id") REFERENCES "public"."airport"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sim_run_airport" ON "sim_run" USING btree ("airport_id","seq");--> statement-breakpoint
CREATE INDEX "sim_run_waiting" ON "sim_run" USING btree ("state","seq");--> statement-breakpoint
ALTER TABLE "staff_user" ADD CONSTRAINT "staff_user_role" CHECK ("staff_user"."role" IN ('OPERATOR', 'SUPERVISOR', 'ADMIN', 'ANALYST'));--> statement-breakpoint
-- A saved scenario never changes (S19): its hash names it. Append-only.
CREATE TRIGGER sim_scenario_append_only BEFORE UPDATE OR DELETE ON "sim_scenario"
  FOR EACH ROW EXECUTE FUNCTION gateflow_append_only();
--> statement-breakpoint
CREATE TRIGGER sim_scenario_no_truncate BEFORE TRUNCATE ON "sim_scenario"
  FOR EACH STATEMENT EXECUTE FUNCTION gateflow_append_only();
