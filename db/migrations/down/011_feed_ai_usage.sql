DROP TABLE IF EXISTS ai_clip_requests;
ALTER TABLE ai_jobs DROP COLUMN IF EXISTS usage_ledger_id;
ALTER TABLE ai_jobs DROP COLUMN IF EXISTS instructions;
DROP TABLE IF EXISTS ai_usage_ledger;
DROP TABLE IF EXISTS ai_usage_accounts;
DROP TABLE IF EXISTS reputation_scores;
DROP TABLE IF EXISTS clip_views;
DROP TABLE IF EXISTS clip_metrics;
ALTER TABLE users DROP COLUMN IF EXISTS is_admin;
