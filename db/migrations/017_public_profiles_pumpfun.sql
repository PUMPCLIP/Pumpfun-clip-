-- Public creator identity metadata and Pump.fun campaign source support.
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_handle text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS users_public_handle ON users(public_handle) WHERE public_handle IS NOT NULL;

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS source_url text;
CREATE INDEX IF NOT EXISTS campaigns_category_live ON campaigns(category,created_at DESC) WHERE state='live';
