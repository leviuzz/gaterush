CREATE TABLE "display_board" (
	"checkpoint_id" uuid PRIMARY KEY NOT NULL,
	"service_day" date NOT NULL,
	"seq" bigint NOT NULL,
	"at_ms" bigint NOT NULL,
	"board" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "display_board" ADD CONSTRAINT "display_board_checkpoint_id_checkpoint_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."checkpoint"("id") ON DELETE no action ON UPDATE no action;