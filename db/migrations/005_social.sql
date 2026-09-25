CREATE TABLE social_oauth_states (
 state_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), verifier text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE TABLE social_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), provider text NOT NULL CHECK(provider IN ('youtube')),
 refresh_token_cipher text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,provider)
);
CREATE TABLE social_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), asset_id uuid NOT NULL REFERENCES media_assets(id),
 provider text NOT NULL CHECK(provider IN ('youtube')), remote_id text NOT NULL, url text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,asset_id,provider)
);
