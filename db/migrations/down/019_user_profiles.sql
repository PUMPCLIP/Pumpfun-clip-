DROP INDEX IF EXISTS users_public_handle_unique;
ALTER TABLE users DROP COLUMN IF EXISTS display_name_customized;
