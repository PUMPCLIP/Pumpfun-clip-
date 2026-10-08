-- Two-clip trial and verified 2 SOL monthly clip plan.
CREATE TABLE IF NOT EXISTS clip_plan_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_lamports bigint NOT NULL CHECK (amount_lamports > 0),
  destination text NOT NULL,
  idempotency_key text NOT NULL,
  signature text UNIQUE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','verified')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS clip_plan_intents_user ON clip_plan_intents(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS clip_plans (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive','active','expired')),
  plan_name text NOT NULL DEFAULT 'monthly_20',
  deposit_lamports bigint NOT NULL CHECK (deposit_lamports > 0),
  deposit_signature text UNIQUE,
  treasury text NOT NULL,
  period_start timestamptz,
  period_end timestamptz,
  clips_used integer NOT NULL DEFAULT 0 CHECK (clips_used >= 0 AND clips_used <= 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='active' AND period_start IS NOT NULL AND period_end IS NOT NULL) OR status<>'active')
);
CREATE INDEX IF NOT EXISTS clip_plans_active_period ON clip_plans(status,period_end);
