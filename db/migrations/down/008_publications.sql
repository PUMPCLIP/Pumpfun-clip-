DROP TABLE IF EXISTS social_account_metadata;
DROP TABLE IF EXISTS social_publications;
ALTER TABLE social_connections DROP CONSTRAINT social_connections_provider_check;
ALTER TABLE social_connections ADD CONSTRAINT social_connections_provider_check CHECK(provider IN ('youtube','tiktok'));
