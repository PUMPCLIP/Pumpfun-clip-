-- Annual 2 SOL plan: 60,000 metered credits, renewable whenever the allowance is exhausted.
ALTER TABLE clip_plans ALTER COLUMN plan_name SET DEFAULT 'annual_60000';
ALTER TABLE clip_plans ADD COLUMN IF NOT EXISTS credit_limit_units integer NOT NULL DEFAULT 60000 CHECK (credit_limit_units > 0);
ALTER TABLE clip_plans ADD COLUMN IF NOT EXISTS credits_used_units integer NOT NULL DEFAULT 0 CHECK (credits_used_units >= 0 AND credits_used_units <= credit_limit_units);
UPDATE clip_plans SET plan_name='annual_60000',credit_limit_units=60000,credits_used_units=LEAST(credits_used_units,60000)
WHERE status='active';
UPDATE ai_usage_accounts a SET free_units=0,balance_units=GREATEST(a.balance_units,60000)
FROM clip_plans p WHERE p.user_id=a.user_id AND p.status='active' AND p.period_end>now();
