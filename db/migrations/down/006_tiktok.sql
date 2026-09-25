DROP TABLE IF EXISTS tiktok_drafts;
ALTER TABLE social_connections DROP CONSTRAINT social_connections_provider_check;
ALTER TABLE social_connections ADD CONSTRAINT social_connections_provider_check CHECK(provider IN ('youtube'));
