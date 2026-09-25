CREATE TABLE ai_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id),
 source_asset_id uuid NOT NULL REFERENCES media_assets(id), requested_by uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','succeeded','failed')),
 transcript jsonb, suggestions jsonb, error_message text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(campaign_id,source_asset_id)
);
CREATE INDEX ai_jobs_queue ON ai_jobs(status,created_at);
