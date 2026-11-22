-- Scans are a record of what happened at the kiosks: append-only, like the log (ADR-043).
CREATE TRIGGER scan_append_only BEFORE UPDATE OR DELETE ON "scan"
  FOR EACH ROW EXECUTE FUNCTION gateflow_append_only();
--> statement-breakpoint
CREATE TRIGGER scan_no_truncate BEFORE TRUNCATE ON "scan"
  FOR EACH STATEMENT EXECUTE FUNCTION gateflow_append_only();
