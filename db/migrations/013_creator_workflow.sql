-- Creator workflow expansion: structured briefs, versioned review, job-locked chat and disputes.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS requested_clip_count integer NOT NULL DEFAULT 1 CHECK (requested_clip_count > 0);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS desired_length_min integer NOT NULL DEFAULT 15 CHECK (desired_length_min >= 0);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS desired_length_max integer NOT NULL DEFAULT 90 CHECK (desired_length_max >= desired_length_min);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_audience text NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tone_style text NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS examples text NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS exclusions text NOT NULL DEFAULT '';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS revision_rounds integer NOT NULL DEFAULT 2 CHECK (revision_rounds >= 0);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '{"budget":false,"deadline":false,"source":false,"requirements":false,"reward":false,"revisionPolicy":false}';

CREATE TABLE IF NOT EXISTS submission_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0), asset_id uuid NOT NULL REFERENCES media_assets(id),
  change_summary text NOT NULL DEFAULT '', created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(submission_id, version_number)
);
CREATE INDEX IF NOT EXISTS submission_versions_submission ON submission_versions(submission_id, version_number DESC);

CREATE TABLE IF NOT EXISTS review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  version_id uuid REFERENCES submission_versions(id) ON DELETE CASCADE, author_id uuid NOT NULL REFERENCES users(id),
  timestamp_seconds numeric(10,3) NOT NULL CHECK (timestamp_seconds >= 0), comment text NOT NULL CHECK (length(comment) BETWEEN 1 AND 2000),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')), resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_comments_submission ON review_comments(submission_id, timestamp_seconds);

CREATE TABLE IF NOT EXISTS campaign_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id), body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  visible_to_customer_care boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaign_messages_campaign ON campaign_messages(campaign_id, created_at);

CREATE TABLE IF NOT EXISTS campaign_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL REFERENCES users(id), reason text NOT NULL CHECK (reason IN ('payment','brief','revision_limit','rights','other')),
  description text NOT NULL CHECK (length(description) BETWEEN 10 AND 4000), state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','care_joined','resolved','dismissed')),
  resolution text, resolved_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS campaign_disputes_open ON campaign_disputes(state, created_at DESC);
