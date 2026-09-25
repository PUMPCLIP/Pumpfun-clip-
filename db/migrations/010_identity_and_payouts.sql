-- Identity and payout expansion. Existing Google users remain compatible.
ALTER TABLE users ALTER COLUMN google_sub DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privy_user_id text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'google';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;

ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_user_id_key;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'external';
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS is_embedded boolean NOT NULL DEFAULT false;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS wallets_user_address ON wallets(user_id,address);
CREATE INDEX IF NOT EXISTS wallets_user_primary ON wallets(user_id,is_primary DESC,updated_at DESC);

CREATE TABLE IF NOT EXISTS payout_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK(provider IN ('phantom','solflare','backpack','axiom','privy_embedded','manual')),
  address text NOT NULL,
  label text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,address)
);
CREATE INDEX IF NOT EXISTS payout_destinations_user ON payout_destinations(user_id,is_default DESC,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payout_destinations_one_default ON payout_destinations(user_id) WHERE is_default;
