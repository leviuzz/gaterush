-- S20: when the passenger first presented (a wait runs from there), and the people who overtook
-- the ticket. Tickets of earlier days take their issue as their first presentation.
ALTER TABLE "queue_token" ADD COLUMN "presented_at_ms" bigint;--> statement-breakpoint
UPDATE "queue_token" SET "presented_at_ms" = "issued_at_ms";--> statement-breakpoint
ALTER TABLE "queue_token" ALTER COLUMN "presented_at_ms" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "queue_token" ADD COLUMN "overtaken" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- A service day's commands, and the events of a range of commands: one day of a long log.
CREATE INDEX "queue_command_day" ON "queue_command" USING btree ("checkpoint_id","service_day","seq");--> statement-breakpoint
CREATE INDEX "queue_event_by_command" ON "queue_event" USING btree ("checkpoint_id","command_seq");
