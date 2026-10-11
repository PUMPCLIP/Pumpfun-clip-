ALTER TABLE wallet_challenges ALTER COLUMN user_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS wallet_login_challenges_address_created
  ON wallet_challenges(address,created_at DESC) WHERE user_id IS NULL;
