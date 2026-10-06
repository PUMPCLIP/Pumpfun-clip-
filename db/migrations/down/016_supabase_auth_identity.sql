DROP INDEX IF EXISTS users_email_lower_idx;
DROP INDEX IF EXISTS users_supabase_user_id_unique;
ALTER TABLE users DROP COLUMN IF EXISTS supabase_user_id;
