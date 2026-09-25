-- Native FFmpeg clip queue. Upgrade databases that applied the earlier provider adapter as well as fresh installs.
DROP INDEX IF EXISTS ai_clip_requests_provider_job;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='ai_clip_requests' AND column_name='provider'
  ) THEN
    ALTER TABLE ai_clip_requests RENAME COLUMN provider TO engine;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='ai_clip_requests' AND column_name='provider_job_id'
  ) THEN
    UPDATE ai_clip_requests SET provider_job_id=NULL;
    ALTER TABLE ai_clip_requests DROP COLUMN provider_job_id;
  END IF;
END $$;
ALTER TABLE ai_clip_requests ALTER COLUMN engine SET DEFAULT 'native';
UPDATE ai_clip_requests SET engine='native',
  status=CASE WHEN status IN ('queued','processing') THEN 'queued' ELSE status END;
ALTER TABLE ai_clip_requests ALTER COLUMN source_asset_id DROP NOT NULL;
ALTER TABLE ai_clip_requests ADD COLUMN source_url text;
ALTER TABLE ai_clip_requests ADD COLUMN start_seconds numeric(10,3);
ALTER TABLE ai_clip_requests ADD COLUMN end_seconds numeric(10,3);
ALTER TABLE ai_clip_requests ADD COLUMN caption text NOT NULL DEFAULT '';
ALTER TABLE ai_clip_requests ADD COLUMN caption_style text NOT NULL DEFAULT 'classic' CHECK(caption_style IN ('classic','bold','signal'));
ALTER TABLE ai_clip_requests ADD COLUMN output_asset_id uuid REFERENCES media_assets(id);
ALTER TABLE ai_clip_requests ADD COLUMN worker_started_at timestamptz;
ALTER TABLE ai_clip_requests ADD CONSTRAINT ai_clip_engine_native CHECK(engine='native');
ALTER TABLE ai_clip_requests ADD CONSTRAINT ai_clip_source_required CHECK(source_asset_id IS NOT NULL OR source_url IS NOT NULL);
ALTER TABLE ai_clip_requests ADD CONSTRAINT ai_clip_time_range CHECK(
  (start_seconds IS NULL AND end_seconds IS NULL) OR
  (start_seconds IS NOT NULL AND end_seconds IS NOT NULL AND start_seconds >= 0 AND end_seconds > start_seconds AND end_seconds-start_seconds <= 180)
);
UPDATE ai_usage_ledger SET action='native_clip' WHERE action='openclip_clip';
CREATE UNIQUE INDEX ai_clip_requests_usage_ledger ON ai_clip_requests(usage_ledger_id) WHERE usage_ledger_id IS NOT NULL;
CREATE INDEX ai_clip_requests_queue ON ai_clip_requests(status,created_at) WHERE status IN ('queued','processing');
