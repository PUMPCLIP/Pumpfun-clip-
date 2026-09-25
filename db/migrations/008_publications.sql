ALTER TABLE social_connections DROP CONSTRAINT social_connections_provider_check;
ALTER TABLE social_connections ADD CONSTRAINT social_connections_provider_check CHECK(provider IN ('youtube','tiktok','instagram','x'));
CREATE TABLE social_publications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), asset_id uuid NOT NULL REFERENCES media_assets(id),
 provider text NOT NULL CHECK(provider IN ('tiktok','instagram','x')),
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','initialized','uploaded','processing','ready','publishing','published','failed','uncertain')),
 remote_ref text, post_id text, caption text NOT NULL DEFAULT '', details jsonb NOT NULL DEFAULT '{}', error_message text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,asset_id,provider)
);
CREATE INDEX social_publications_user ON social_publications(user_id,created_at DESC);
CREATE TABLE social_account_metadata (
 user_id uuid NOT NULL REFERENCES users(id), provider text NOT NULL CHECK(provider IN ('instagram','x')),
 remote_user_id text NOT NULL, display_name text NOT NULL DEFAULT '',
 PRIMARY KEY(user_id,provider)
);
