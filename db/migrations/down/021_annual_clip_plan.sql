ALTER TABLE clip_plans DROP COLUMN IF EXISTS credits_used_units;
ALTER TABLE clip_plans DROP COLUMN IF EXISTS credit_limit_units;
ALTER TABLE clip_plans ALTER COLUMN plan_name SET DEFAULT 'annual_20';
