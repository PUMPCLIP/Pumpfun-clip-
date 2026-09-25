-- Discovery, creator reputation, native clip jobs, and metered AI usage.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS clip_metrics (
  submission_id uuid PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  view_count bigint NOT NULL DEFAULT 0 CHECK(view_count >= 0),
  like_count bigint NOT NULL DEFAULT 0 CHECK(like_count >= 0),
  share_count bigint NOT NULL DEFAULT 0 CHECK(share_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS clip_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  viewer_id uuid REFERENCES users(id) ON DELETE SET NULL,
  visitor_hash text,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clip_views_submission ON clip_views(submission_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS clip_metrics_popular ON clip_metrics(view_count DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS reputation_scores (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  accepted_count integer NOT NULL DEFAULT 0,
  total_views bigint NOT NULL DEFAULT 0,
  reputation_score numeric(8,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_usage_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  free_units integer NOT NULL DEFAULT 10 CHECK(free_units >= 0),
  balance_units integer NOT NULL DEFAULT 0 CHECK(balance_units >= 0),
  consumed_units bigint NOT NULL DEFAULT 0 CHECK(consumed_units >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL,
  units integer NOT NULL CHECK(units > 0),
  status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','consumed','released','refunded')),
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS ai_usage_user ON ai_usage_ledger(user_id,created_at DESC);
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS instructions text NOT NULL DEFAULT '';
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS usage_ledger_id uuid REFERENCES ai_usage_ledger(id);

CREATE TABLE IF NOT EXISTS ai_clip_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  source_asset_id uuid NOT NULL REFERENCES media_assets(id),
  engine text NOT NULL DEFAULT 'native',
  instructions text NOT NULL DEFAULT '',
  aspect_ratio text NOT NULL DEFAULT '9:16' CHECK(aspect_ratio IN ('9:16','1:1','16:9')),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','succeeded','failed')),
  output jsonb NOT NULL DEFAULT '{}',
  usage_ledger_id uuid REFERENCES ai_usage_ledger(id),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_clip_requests_user ON ai_clip_requests(user_id,created_at DESC);
