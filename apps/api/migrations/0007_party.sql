CREATE TABLE "party_pass" (
	"checkpoint_id" uuid NOT NULL,
	"dedup_key" text NOT NULL,
	"ticket_id" uuid NOT NULL,
	"command_seq" bigint NOT NULL,
	"at_ms" bigint NOT NULL,
	CONSTRAINT "party_pass_checkpoint_id_command_seq_pk" PRIMARY KEY("checkpoint_id","command_seq"),
	CONSTRAINT "party_pass_dedup_key" CHECK ("party_pass"."dedup_key" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "scan" DROP CONSTRAINT "scan_outcome";--> statement-breakpoint
ALTER TABLE "party_pass" ADD CONSTRAINT "party_pass_checkpoint_id_checkpoint_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoint"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_pass" ADD CONSTRAINT "party_pass_ticket_id_queue_token_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."queue_token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "party_pass_dedup" ON "party_pass" USING btree ("checkpoint_id","dedup_key");--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_outcome" CHECK ("scan"."outcome" IN ('ISSUED', 'RETRIEVED', 'REACTIVATED', 'ADDED', 'REJECTED', 'NEEDS_ASSISTANCE'));--> statement-breakpoint
-- The passes a party added are a record, like the scans: append-only (ADR-046).
CREATE TRIGGER party_pass_append_only BEFORE UPDATE OR DELETE ON "party_pass"
  FOR EACH ROW EXECUTE FUNCTION gateflow_append_only();
--> statement-breakpoint
CREATE TRIGGER party_pass_no_truncate BEFORE TRUNCATE ON "party_pass"
  FOR EACH STATEMENT EXECUTE FUNCTION gateflow_append_only();
