-- Worker reliability: lease tokens prevent stale workers from completing reclaimed jobs.
ALTER TABLE studio_jobs ADD COLUMN IF NOT EXISTS lease_id uuid;
ALTER TABLE studio_jobs ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS lease_id uuid;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
ALTER TABLE ai_clip_requests ADD COLUMN IF NOT EXISTS lease_id uuid;
ALTER TABLE ai_clip_requests ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;
CREATE INDEX IF NOT EXISTS studio_jobs_lease ON studio_jobs(status,lease_expires_at) WHERE status='processing';
CREATE INDEX IF NOT EXISTS ai_jobs_lease ON ai_jobs(status,lease_expires_at) WHERE status='processing';
CREATE INDEX IF NOT EXISTS ai_clip_requests_lease ON ai_clip_requests(status,lease_expires_at) WHERE status='processing';
