import {db} from '@/lib/db';
import {mutation,jsonError} from '@/lib/auth';
import {requireAdmin} from '@/lib/ai-usage';
export const runtime='nodejs';

export async function GET(request:Request){
  try{
    const admin=await mutation(request);
    await requireAdmin(admin.user_id);
    const result=await db.query(`
      WITH account_stats AS (
        SELECT
          count(*)::int AS trial_accounts,
          count(*) FILTER (WHERE free_units < 10)::int AS trials_started,
          count(*) FILTER (WHERE free_units = 0)::int AS trials_exhausted,
          coalesce(sum(GREATEST(0,10-free_units))/5,0)::int AS free_clips_used
        FROM ai_usage_accounts
      ),
      intent_stats AS (
        SELECT
          count(*)::int AS intents_total,
          count(*) FILTER (WHERE state='verified')::int AS conversions_total,
          count(*) FILTER (WHERE state='pending')::int AS intents_pending,
          count(*) FILTER (WHERE state='verified' AND created_at >= now()-interval '30 days')::int AS conversions_30d,
          count(*) FILTER (WHERE state='verified' AND created_at >= now()-interval '7 days')::int AS conversions_7d
        FROM clip_plan_intents
      ),
      plan_stats AS (
        SELECT
          count(*) FILTER (WHERE status='active' AND period_end>now())::int AS active_paid_plans,
          count(*) FILTER (WHERE status='active' AND period_end>now() AND period_end<=now()+interval '7 days')::int AS expiring_7d,
          coalesce(sum(clips_used) FILTER (WHERE status='active' AND period_end>now()),0)::int AS paid_clips_used,
          coalesce(sum(deposit_lamports) FILTER (WHERE status='active' AND period_end>now()),0)::text AS active_deposit_lamports
        FROM clip_plans
      ),
      daily AS (
        SELECT day::date AS day,
          coalesce((SELECT count(*) FROM ai_usage_ledger l WHERE l.action='native_clip' AND l.created_at::date=day::date AND coalesce((l.metadata->>'planClip')::boolean,false)=false),0)::int AS free_clip_jobs,
          coalesce((SELECT count(*) FROM clip_plan_intents i WHERE i.state='verified' AND i.created_at::date=day::date),0)::int AS conversions
        FROM generate_series(current_date-interval '13 days',current_date,interval '1 day') day
      )
      SELECT json_build_object(
        'generatedAt',now(),
        'trial',row_to_json(account_stats),
        'intents',row_to_json(intent_stats),
        'plans',row_to_json(plan_stats),
        'conversionRate',case when account_stats.trials_exhausted=0 then 0 else round(intent_stats.conversions_total::numeric/account_stats.trials_exhausted*100,2) end,
        'daily',(SELECT coalesce(json_agg(daily ORDER BY day),'[]'::json) FROM daily)
      ) AS analytics
      FROM account_stats,intent_stats,plan_stats`,[]);
    return Response.json(result.rows[0]?.analytics||{});
  }catch(error){return jsonError(error,crypto.randomUUID());}
}
