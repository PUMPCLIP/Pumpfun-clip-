ALTER TABLE social_connections DROP CONSTRAINT social_connections_provider_check;
ALTER TABLE social_connections ADD CONSTRAINT social_connections_provider_check CHECK(provider IN ('youtube','tiktok'));
CREATE TABLE tiktok_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), asset_id uuid NOT NULL REFERENCES media_assets(id),
 publish_id text UNIQUE, status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','uploading','uploaded','inbox','published','failed')),
 fail_reason text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,asset_id)
);
