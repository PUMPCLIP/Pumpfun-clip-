DROP INDEX IF EXISTS users_public_handle;
ALTER TABLE users DROP COLUMN IF EXISTS social_links;
ALTER TABLE users DROP COLUMN IF EXISTS public_handle;
DROP INDEX IF EXISTS campaigns_category_live;
ALTER TABLE campaigns DROP COLUMN IF EXISTS source_url;
