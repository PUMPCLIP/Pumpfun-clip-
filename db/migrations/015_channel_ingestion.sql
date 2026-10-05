-- YouTube channel ingestion: enumerate channel videos and queue one native clip job per video.
CREATE TABLE IF NOT EXISTS channel_ingestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_url text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','completed','failed')),
  max_videos integer NOT NULL DEFAULT 100 CHECK(max_videos BETWEEN 1 AND 500),
  discovered_count integer NOT NULL DEFAULT 0 CHECK(discovered_count >= 0),
  queued_count integer NOT NULL DEFAULT 0 CHECK(queued_count >= 0),
  processed_count integer NOT NULL DEFAULT 0 CHECK(processed_count >= 0),
  error_message text,
  lease_id uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS channel_ingestions_user ON channel_ingestions(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS channel_ingestions_queue ON channel_ingestions(status,created_at) WHERE status IN ('queued','processing');
CREATE UNIQUE INDEX IF NOT EXISTS channel_ingestions_active_url ON channel_ingestions(user_id,channel_url) WHERE status IN ('queued','processing');

CREATE TABLE IF NOT EXISTS channel_ingestion_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_id uuid NOT NULL REFERENCES channel_ingestions(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  source_url text NOT NULL,
  title text NOT NULL DEFAULT '',
  position integer NOT NULL CHECK(position >= 0),
  status text NOT NULL DEFAULT 'discovered' CHECK(status IN ('discovered','clip_queued','succeeded','failed')),
  clip_request_id uuid REFERENCES ai_clip_requests(id) ON DELETE SET NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ingestion_id,external_id)
);
CREATE INDEX IF NOT EXISTS channel_ingestion_videos_queue ON channel_ingestion_videos(ingestion_id,status,position);
ALTER TABLE ai_clip_requests ADD COLUMN IF NOT EXISTS channel_video_id uuid REFERENCES channel_ingestion_videos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ai_clip_requests_channel_video ON ai_clip_requests(channel_video_id) WHERE channel_video_id IS NOT NULL;
