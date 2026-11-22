CREATE TABLE "checkpoint_timer" (
	"checkpoint_id" uuid PRIMARY KEY NOT NULL,
	"service_day" date NOT NULL,
	"next_due_ms" bigint,
	"updated_seq" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admission" DROP CONSTRAINT "admission_method";--> statement-breakpoint
ALTER TABLE "queue_token" DROP CONSTRAINT "queue_token_state";--> statement-breakpoint
ALTER TABLE "scan" DROP CONSTRAINT "scan_outcome";--> statement-breakpoint
ALTER TABLE "queue_token" ADD COLUMN "last_called_at_ms" bigint;--> statement-breakpoint
ALTER TABLE "checkpoint_timer" ADD CONSTRAINT "checkpoint_timer_checkpoint_id_checkpoint_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoint"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkpoint_timer_due" ON "checkpoint_timer" USING btree ("next_due_ms") WHERE "checkpoint_timer"."next_due_ms" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "admission" ADD CONSTRAINT "admission_method" CHECK ("admission"."method" IN ('NUMBER', 'REF', 'PASS'));--> statement-breakpoint
ALTER TABLE "queue_token" ADD CONSTRAINT "queue_token_state" CHECK ("queue_token"."state" IN ('QUEUED', 'PREPARE', 'CALLED', 'RECALLED', 'NO_SHOW', 'ADMITTED', 'EXPIRED', 'REVIEW', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "scan" ADD CONSTRAINT "scan_outcome" CHECK ("scan"."outcome" IN ('ISSUED', 'RETRIEVED', 'REACTIVATED', 'REJECTED', 'NEEDS_ASSISTANCE'));--> statement-breakpoint
-- Before S15 a ticket was called again only after a reactivation: its first call stands for its last.
UPDATE "queue_token" SET "last_called_at_ms" = "first_called_at_ms" WHERE "last_called_at_ms" IS NULL;
