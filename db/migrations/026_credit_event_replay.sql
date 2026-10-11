CREATE TABLE IF NOT EXISTS credit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('credit_reserved','job_status_changed','credit_settled')),
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_events_user_id_idx ON credit_events(user_id,id);
CREATE INDEX IF NOT EXISTS credit_events_created_at_idx ON credit_events(created_at);
