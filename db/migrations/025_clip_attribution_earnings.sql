CREATE TABLE clip_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  stream_alert_event_id uuid REFERENCES stream_alert_events(id) ON DELETE CASCADE,
  chain_alert_event_id uuid REFERENCES chain_alert_events(id) ON DELETE CASCADE,
  url text NOT NULL,
  platform text NOT NULL CHECK(platform IN ('tiktok','x','youtube_shorts')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(campaign_id IS NOT NULL OR stream_alert_event_id IS NOT NULL OR chain_alert_event_id IS NOT NULL),
  CHECK(stream_alert_event_id IS NULL OR chain_alert_event_id IS NULL)
);
CREATE INDEX clip_links_campaign ON clip_links(campaign_id,created_at DESC) WHERE active;
CREATE INDEX clip_links_stream_alert ON clip_links(stream_alert_event_id,created_at DESC) WHERE active;
CREATE INDEX clip_links_chain_alert ON clip_links(chain_alert_event_id,created_at DESC) WHERE active;
CREATE UNIQUE INDEX clip_links_campaign_url ON clip_links(campaign_id,url) WHERE campaign_id IS NOT NULL AND active;
CREATE UNIQUE INDEX clip_links_stream_url ON clip_links(stream_alert_event_id,url) WHERE stream_alert_event_id IS NOT NULL AND active;
CREATE UNIQUE INDEX clip_links_chain_url ON clip_links(chain_alert_event_id,url) WHERE chain_alert_event_id IS NOT NULL AND active;

CREATE TABLE trade_intents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  wallet_address text NOT NULL,
  mint text NOT NULL,
  side text NOT NULL CHECK(side IN ('buy','sell')),
  amount_raw numeric(40,0) NOT NULL CHECK(amount_raw > 0),
  route text NOT NULL CHECK(route IN ('pump','jupiter')),
  clip_link_id uuid REFERENCES clip_links(id) ON DELETE SET NULL,
  clipper_user_id uuid REFERENCES users(id),
  streamer_user_id uuid REFERENCES users(id),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  stream_alert_event_id uuid REFERENCES stream_alert_events(id) ON DELETE SET NULL,
  fee_bps integer NOT NULL DEFAULT 0 CHECK(fee_bps IN (0,100)),
  fee_lamports bigint NOT NULL DEFAULT 0 CHECK(fee_lamports >= 0),
  clipper_lamports bigint NOT NULL DEFAULT 0 CHECK(clipper_lamports >= 0),
  streamer_lamports bigint NOT NULL DEFAULT 0 CHECK(streamer_lamports >= 0),
  platform_lamports bigint NOT NULL DEFAULT 0 CHECK(platform_lamports >= 0),
  treasury_address text,
  message_hash text NOT NULL,
  signature text UNIQUE,
  state text NOT NULL DEFAULT 'built' CHECK(state IN ('built','submitted','confirmed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  credits_recorded_at timestamptz,
  CHECK(fee_lamports=clipper_lamports+streamer_lamports+platform_lamports)
);
CREATE INDEX trade_intents_user ON trade_intents(user_id,created_at DESC);
CREATE INDEX trade_intents_clip_link ON trade_intents(clip_link_id,created_at DESC) WHERE clip_link_id IS NOT NULL;
CREATE INDEX trade_intents_status ON trade_intents(state,created_at DESC);

CREATE TABLE clip_earnings_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  destination text NOT NULL,
  lamports bigint NOT NULL CHECK(lamports > 0),
  idempotency_key text NOT NULL,
  signed_transaction text NOT NULL,
  blockhash text NOT NULL,
  last_valid_block_height bigint NOT NULL,
  signature text UNIQUE,
  state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','broadcast','paid','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  UNIQUE(user_id,idempotency_key)
);
CREATE INDEX clip_earnings_withdrawals_user ON clip_earnings_withdrawals(user_id,created_at DESC);

CREATE TABLE clip_earnings_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_intent_id uuid NOT NULL REFERENCES trade_intents(id),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  wallet_address text,
  beneficiary_role text NOT NULL CHECK(beneficiary_role IN ('clipper','streamer','platform')),
  lamports bigint NOT NULL CHECK(lamports > 0),
  status text NOT NULL DEFAULT 'accrued' CHECK(status IN ('accrued','reserved','paid','reversed')),
  withdrawal_id uuid REFERENCES clip_earnings_withdrawals(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  UNIQUE(trade_intent_id,beneficiary_role)
);
CREATE INDEX clip_earnings_user_status ON clip_earnings_ledger(user_id,status,created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX clip_earnings_trade ON clip_earnings_ledger(trade_intent_id);
