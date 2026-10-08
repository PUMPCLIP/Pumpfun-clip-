ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_key text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS users_active_public_handle
  ON users(public_handle) WHERE deleted_at IS NULL AND public_handle IS NOT NULL;

CREATE TABLE IF NOT EXISTS profile_follows (
  follower_id uuid NOT NULL REFERENCES users(id),
  followed_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id),
  CONSTRAINT profile_follows_no_self CHECK (follower_id <> followed_id)
);
CREATE INDEX IF NOT EXISTS profile_follows_followed_created
  ON profile_follows(followed_id, created_at DESC);
CREATE INDEX IF NOT EXISTS profile_follows_follower_created
  ON profile_follows(follower_id, created_at DESC);
