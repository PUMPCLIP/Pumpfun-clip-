export const NATIVE_CLIP_UNITS = 5 as const;

export const FREE_TRIAL_AVAILABILITY_SQL = `
  SELECT COALESCE(a.free_units, 0)::int AS free_units,
    EXISTS (
      SELECT 1 FROM clip_plans p
      WHERE p.user_id = requested.user_id
        AND p.status = 'active'
        AND p.period_start <= now()
        AND p.period_end > now()
    ) AS has_active_plan
  FROM (SELECT $1::uuid AS user_id) requested
  LEFT JOIN ai_usage_accounts a ON a.user_id = requested.user_id
`;

export function canUseWalletlessTrialClip(freeUnits: number, hasActivePlan: boolean): boolean {
  return !hasActivePlan && Number(freeUnits) >= NATIVE_CLIP_UNITS;
}

export function isFreeTrialOnlyNativeClipReservation(ledger: {
  action?: string;
  units?: number | string;
  metadata?: Record<string, unknown> | null;
}): boolean {
  const metadata = ledger.metadata || {};
  return ledger.action === 'native_clip'
    && Number(ledger.units) === NATIVE_CLIP_UNITS
    && Number(metadata.freeUnits || 0) >= NATIVE_CLIP_UNITS
    && Number(metadata.paidUnits || 0) === 0
    && !metadata.planCredits;
}
