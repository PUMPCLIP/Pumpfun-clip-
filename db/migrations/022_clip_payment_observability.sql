-- Structured observability for 2 SOL annual clip-plan verification attempts, retries, and failures.
CREATE INDEX IF NOT EXISTS audit_events_clip_plan_verification
  ON audit_events(action,created_at DESC)
  WHERE action LIKE 'clip_plan.verification_%';
