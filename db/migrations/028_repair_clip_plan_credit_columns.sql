-- Repair production schema drift where migration 021 is recorded as applied
-- but its annual-plan credit columns are absent from clip_plans.
ALTER TABLE clip_plans ADD COLUMN IF NOT EXISTS credit_limit_units integer;
ALTER TABLE clip_plans ADD COLUMN IF NOT EXISTS credits_used_units integer;

UPDATE clip_plans
SET credit_limit_units = 60000
WHERE credit_limit_units IS NULL OR credit_limit_units <= 0;

UPDATE clip_plans
SET credits_used_units = LEAST(GREATEST(COALESCE(credits_used_units, 0), 0), credit_limit_units)
WHERE credits_used_units IS NULL
   OR credits_used_units < 0
   OR credits_used_units > credit_limit_units;

-- Match the established annual plan policy in migration 021 for active plans.
UPDATE clip_plans
SET plan_name = 'annual_60000',
    credit_limit_units = 60000,
    credits_used_units = LEAST(credits_used_units, 60000)
WHERE status = 'active';

ALTER TABLE clip_plans ALTER COLUMN credit_limit_units SET DEFAULT 60000;
ALTER TABLE clip_plans ALTER COLUMN credit_limit_units SET NOT NULL;
ALTER TABLE clip_plans ALTER COLUMN credits_used_units SET DEFAULT 0;
ALTER TABLE clip_plans ALTER COLUMN credits_used_units SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'clip_plans'::regclass
      AND conname IN ('clip_plans_credit_limit_units_check', 'clip_plans_credit_limit_units_positive_repair_check')
  ) THEN
    ALTER TABLE clip_plans
      ADD CONSTRAINT clip_plans_credit_limit_units_positive_repair_check
      CHECK (credit_limit_units > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'clip_plans'::regclass
      AND conname IN ('clip_plans_credits_used_units_check', 'clip_plans_credits_used_units_bounds_repair_check')
  ) THEN
    ALTER TABLE clip_plans
      ADD CONSTRAINT clip_plans_credits_used_units_bounds_repair_check
      CHECK (credits_used_units >= 0 AND credits_used_units <= credit_limit_units);
  END IF;
END $$;

-- Re-apply the corresponding account credit adjustment if the original
-- annual-plan migration was marked complete before its data step ran.
UPDATE ai_usage_accounts a
SET free_units = 0,
    balance_units = GREATEST(a.balance_units, 60000)
FROM clip_plans p
WHERE p.user_id = a.user_id
  AND p.status = 'active'
  AND p.period_end > now();
