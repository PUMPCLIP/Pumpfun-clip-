CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), google_sub text UNIQUE NOT NULL,
  email text NOT NULL, display_name text NOT NULL, roles text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  address text NOT NULL UNIQUE, network text NOT NULL, UNIQUE(user_id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  token_hash text NOT NULL UNIQUE, csrf_hash text NOT NULL, expires_at timestamptz NOT NULL,
  revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wallet_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  address text NOT NULL, nonce_hash text NOT NULL, message text NOT NULL,
  expires_at timestamptz NOT NULL, used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE token_gate_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  wallet_id uuid NOT NULL REFERENCES wallets(id), mint text NOT NULL, network text NOT NULL,
  balance_raw numeric(40,0) NOT NULL, slot bigint NOT NULL, checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL, object_key text NOT NULL, sha256 text, mime text NOT NULL,
  byte_size bigint NOT NULL CHECK(byte_size >= 0), source_url text, rights_declared_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','uploaded','verified','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), streamer_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL, description text NOT NULL DEFAULT '', source_asset_id uuid REFERENCES media_assets(id),
  license_terms text NOT NULL DEFAULT '', target_platforms text[] NOT NULL DEFAULT '{}',
  start_at timestamptz, end_at timestamptz, fixed_reward_lamports bigint NOT NULL DEFAULT 0 CHECK(fixed_reward_lamports >= 0),
  entry_fee_raw numeric(40,0) NOT NULL DEFAULT 0 CHECK(entry_fee_raw >= 0),
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','fee_pending','funding_pending','funded','live','ended','settling','closed')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE fee_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  campaign_id uuid NOT NULL REFERENCES campaigns(id), purpose text NOT NULL CHECK(purpose IN ('creation','entry')),
  mint text NOT NULL, amount_raw numeric(40,0) NOT NULL CHECK(amount_raw >= 0), treasury text NOT NULL,
  signature text UNIQUE, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','verified')),
  idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,purpose,idempotency_key), UNIQUE(user_id,campaign_id,purpose)
);
CREATE TABLE funding_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id),
  user_id uuid NOT NULL REFERENCES users(id), expected_lamports bigint NOT NULL CHECK(expected_lamports > 0),
  destination text NOT NULL, signature text UNIQUE, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','verified')),
  idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,idempotency_key)
);
CREATE TABLE escrow_accounts (
  campaign_id uuid PRIMARY KEY REFERENCES campaigns(id), funded_lamports bigint NOT NULL DEFAULT 0 CHECK(funded_lamports >= 0),
  reserved_lamports bigint NOT NULL DEFAULT 0 CHECK(reserved_lamports >= 0),
  paid_lamports bigint NOT NULL DEFAULT 0 CHECK(paid_lamports >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(reserved_lamports + paid_lamports <= funded_lamports)
);
CREATE TABLE campaign_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id),
  clipper_id uuid NOT NULL REFERENCES users(id), fee_intent_id uuid REFERENCES fee_intents(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,clipper_id)
);
CREATE TABLE submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES campaigns(id),
  clipper_id uuid NOT NULL REFERENCES users(id), asset_id uuid REFERENCES media_assets(id),
  media_sha256 text NOT NULL, social_url text, state text NOT NULL DEFAULT 'submitted'
    CHECK(state IN ('submitted','in_review','approved','rejected','published','measuring','rewarded')),
  review_reason text, reviewed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,media_sha256)
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id),
  action text NOT NULL, subject_type text NOT NULL, subject_id uuid NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_discover ON campaigns(state,created_at DESC);
CREATE INDEX submissions_campaign ON submissions(campaign_id,created_at DESC);
