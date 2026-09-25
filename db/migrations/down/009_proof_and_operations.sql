DROP TABLE IF EXISTS content_reports;
DROP TABLE IF EXISTS user_rate_limits;
ALTER TABLE studio_jobs DROP COLUMN IF EXISTS caption_style;
DROP INDEX IF EXISTS submissions_publication;
ALTER TABLE submissions DROP COLUMN IF EXISTS publication_id;
ALTER TABLE campaigns DROP COLUMN IF EXISTS proof_policy;
