-- Signed stream webhooks and wallet activity events.
-- This migration records alerts only; it never authorizes or broadcasts trades.
CREATE TABLE IF NOT EXISTS stream_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK(provider IN ('kick','twitch','youtube','custom')),
  external_id text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','revoked')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,external_id)
);
CREATE INDEX IF NOT EXISTS stream_sources_owner ON stream_sources(owner_id,status);

CREATE TABLE IF NOT EXISTS stream_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES stream_sources(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK(provider IN ('kick','twitch','youtube','custom')),
  external_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL DEFAULT 'stream_event',
  matched_terms text[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processed','ignored','failed')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_message text
);
CREATE INDEX IF NOT EXISTS stream_alert_events_source ON stream_alert_events(source_id,detected_at DESC);
CREATE INDEX IF NOT EXISTS stream_alert_events_status ON stream_alert_events(status,detected_at DESC);

CREATE TABLE IF NOT EXISTS wallet_watch_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id uuid REFERENCES wallets(id) ON DELETE CASCADE,
  address text NOT NULL,
  network text NOT NULL,
  label text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,address,network)
);
CREATE INDEX IF NOT EXISTS wallet_watch_targets_enabled ON wallet_watch_targets(network,address) WHERE enabled;
INSERT INTO wallet_watch_targets(user_id,wallet_id,address,network,label)
  SELECT user_id,id,address,network,'Linked wallet' FROM wallets
  ON CONFLICT(user_id,address,network) DO UPDATE SET wallet_id=EXCLUDED.wallet_id,updated_at=now();

CREATE TABLE IF NOT EXISTS chain_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_target_id uuid REFERENCES wallet_watch_targets(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK(provider IN ('helius','quicknode','custom')),
  network text NOT NULL,
  external_event_id text NOT NULL UNIQUE,
  signature text,
  event_type text NOT NULL DEFAULT 'wallet_activity',
  wallet_address text NOT NULL,
  mint text,
  amount_raw numeric(40,0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processed','ignored','failed')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_message text
);
CREATE INDEX IF NOT EXISTS chain_alert_events_target ON chain_alert_events(watch_target_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS chain_alert_events_wallet ON chain_alert_events(wallet_address,network,observed_at DESC);
