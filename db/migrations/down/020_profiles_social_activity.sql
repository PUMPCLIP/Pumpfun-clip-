DROP TABLE IF EXISTS profile_follows;
DROP INDEX IF EXISTS users_active_public_handle;
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE users DROP COLUMN IF EXISTS avatar_updated_at;
ALTER TABLE users DROP COLUMN IF EXISTS avatar_key;
