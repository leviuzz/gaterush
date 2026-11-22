-- The log of every checkpoint and the admissions are append-only (ADR-042): rows are added, never
-- changed or removed, by anyone who goes through the database's rules. The hash chain of the log
-- shows any change made around them (by disabling these triggers).
CREATE FUNCTION gateflow_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: rows are never changed or removed', TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER queue_command_append_only BEFORE UPDATE OR DELETE ON "queue_command"
  FOR EACH ROW EXECUTE FUNCTION gateflow_append_only();
--> statement-breakpoint
CREATE TRIGGER queue_command_no_truncate BEFORE TRUNCATE ON "queue_command"
  FOR EACH STATEMENT EXECUTE FUNCTION gateflow_append_only();
--> statement-breakpoint
CREATE TRIGGER queue_event_append_only BEFORE UPDATE OR DELETE ON "queue_event"
  FOR EACH ROW EXECUTE FUNCTION gateflow_append_only();
--> statement-breakpoint
CREATE TRIGGER queue_event_no_truncate BEFORE TRUNCATE ON "queue_event"
  FOR EACH STATEMENT EXECUTE FUNCTION gateflow_append_only();
--> statement-breakpoint
CREATE TRIGGER admission_append_only BEFORE UPDATE OR DELETE ON "admission"
  FOR EACH ROW EXECUTE FUNCTION gateflow_append_only();
--> statement-breakpoint
CREATE TRIGGER admission_no_truncate BEFORE TRUNCATE ON "admission"
  FOR EACH STATEMENT EXECUTE FUNCTION gateflow_append_only();
