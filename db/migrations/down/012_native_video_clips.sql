DROP INDEX IF EXISTS ai_clip_requests_queue;
DROP INDEX IF EXISTS ai_clip_requests_usage_ledger;
ALTER TABLE ai_clip_requests DROP CONSTRAINT IF EXISTS ai_clip_engine_native;
ALTER TABLE ai_clip_requests DROP CONSTRAINT IF EXISTS ai_clip_time_range;
ALTER TABLE ai_clip_requests DROP CONSTRAINT IF EXISTS ai_clip_source_required;
ALTER TABLE ai_clip_requests DROP COLUMN IF EXISTS worker_started_at;
ALTER TABLE ai_clip_requests DROP COLUMN IF EXISTS output_asset_id;
ALTER TABLE ai_clip_requests DROP COLUMN IF EXISTS caption_style;
ALTER TABLE ai_clip_requests DROP COLUMN IF EXISTS caption;
ALTER TABLE ai_clip_requests DROP COLUMN IF EXISTS end_seconds;
ALTER TABLE ai_clip_requests DROP COLUMN IF EXISTS start_seconds;
-- The earlier native-only schema requires a source asset and cannot represent URL jobs.
DELETE FROM ai_clip_requests WHERE source_asset_id IS NULL;
ALTER TABLE ai_clip_requests DROP COLUMN IF EXISTS source_url;
ALTER TABLE ai_clip_requests ALTER COLUMN source_asset_id SET NOT NULL;
ALTER TABLE ai_clip_requests ALTER COLUMN engine SET DEFAULT 'native';
