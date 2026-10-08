-- Let users keep a chosen public name and reserve a unique public profile handle.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name_customized boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS users_public_handle_unique
  ON users (lower(public_handle))
  WHERE public_handle IS NOT NULL AND btrim(public_handle) <> '';
