CREATE TABLE IF NOT EXISTS clip_interaction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clip_id uuid NOT NULL REFERENCES ai_clip_requests(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  event_type text NOT NULL CHECK(event_type IN ('preview_started','preview_paused','preview_completed','download_clicked')),
  position_seconds numeric(10,3) CHECK(position_seconds IS NULL OR position_seconds >= 0),
  session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,event_id)
);
CREATE INDEX IF NOT EXISTS clip_interaction_events_user_created
  ON clip_interaction_events(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS clip_interaction_events_clip_type
  ON clip_interaction_events(clip_id,event_type,created_at DESC);
