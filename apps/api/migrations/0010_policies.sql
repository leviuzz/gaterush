CREATE TABLE "policy_activation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "policy_activation_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"checkpoint_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"from_service_day" date NOT NULL,
	"activated_at_ms" bigint NOT NULL,
	"activated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"airport_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"policy_id" text NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at_ms" bigint NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "policy_version_hash" UNIQUE("airport_id","hash"),
	CONSTRAINT "policy_version_hash_hex" CHECK ("policy_version"."hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "policy_activation" ADD CONSTRAINT "policy_activation_checkpoint_id_checkpoint_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoint"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_activation" ADD CONSTRAINT "policy_activation_policy_version_id_policy_version_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_version" ADD CONSTRAINT "policy_version_airport_id_airport_id_fk" FOREIGN KEY ("airport_id") REFERENCES "public"."airport"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_activation_checkpoint" ON "policy_activation" USING btree ("checkpoint_id","from_service_day");--> statement-breakpoint
-- A policy version never changes, and an activation stays on record (ADR-050): append-only.
CREATE TRIGGER policy_version_append_only BEFORE UPDATE OR DELETE ON "policy_version"
  FOR EACH ROW EXECUTE FUNCTION gateflow_append_only();
--> statement-breakpoint
CREATE TRIGGER policy_version_no_truncate BEFORE TRUNCATE ON "policy_version"
  FOR EACH STATEMENT EXECUTE FUNCTION gateflow_append_only();
--> statement-breakpoint
CREATE TRIGGER policy_activation_append_only BEFORE UPDATE OR DELETE ON "policy_activation"
  FOR EACH ROW EXECUTE FUNCTION gateflow_append_only();
--> statement-breakpoint
CREATE TRIGGER policy_activation_no_truncate BEFORE TRUNCATE ON "policy_activation"
  FOR EACH STATEMENT EXECUTE FUNCTION gateflow_append_only();
