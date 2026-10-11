import {db,one,tx} from './db';
import {config} from './config';
import {ApiError} from './auth';

export const CLIP_COST_UNITS=5;
export const TRIAL_CLIPS=2;
export const PLAN_CREDITS=60_000;
export const PLAN_NAME='annual_60000';
export const PLAN_SOL_LAMPORTS=2_000_000_000n;

export function clipPlanPaymentConfig(){
  if(!config.solTreasury) throw new ApiError('CLIP_PLAN_NOT_CONFIGURED',503,'The 2 SOL clip plan is not configured yet.');
  return {amountLamports:PLAN_SOL_LAMPORTS.toString(),amountSol:'2',destination:config.solTreasury,network:config.cluster};
}

export async function clipPlanStatus(userId:string){
  await db.query('INSERT INTO ai_usage_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[userId]);
  const wallet=await one<{address:string}>('SELECT address FROM wallets WHERE user_id=$1 ORDER BY is_primary DESC,updated_at DESC LIMIT 1',[userId]);
  const account=await one<any>('SELECT free_units,balance_units FROM ai_usage_accounts WHERE user_id=$1',[userId]);
  const plan=await one<any>('SELECT status,plan_name,deposit_lamports,period_start,period_end,credit_limit_units,credits_used_units,deposit_signature FROM clip_plans WHERE user_id=$1',[userId]);
  const active=plan?.status==='active' && plan.period_end && new Date(plan.period_end).getTime()>Date.now();
  if(plan?.status==='active'&&!active) await db.query("UPDATE clip_plans SET status='expired',updated_at=now() WHERE user_id=$1 AND status='active' AND period_end<=now()",[userId]);
  return {
    trial:{total:TRIAL_CLIPS,remaining:Math.min(TRIAL_CLIPS,Math.floor(Number(account?.free_units||0)/CLIP_COST_UNITS))},
    wallet:wallet?.address||null,
    plan:active?{status:'active',name:plan.plan_name,annualCredits:Number(plan.credit_limit_units||PLAN_CREDITS),used:Number(plan.credits_used_units||0),remaining:Math.max(0,Number(plan.credit_limit_units||PLAN_CREDITS)-Number(plan.credits_used_units||0)),balanceUnits:Number(account?.balance_units||0),periodStart:plan.period_start,periodEnd:plan.period_end}:null,
    payment:config.solTreasury?{amountLamports:PLAN_SOL_LAMPORTS.toString(),amountSol:'2',destination:config.solTreasury,network:config.cluster}:null,
  };
}

export async function activateClipPlan(userId:string,intent:any,signature:string){
  return tx(async c=>{
    const updated=await one<any>("UPDATE clip_plan_intents SET state='verified',signature=$2,updated_at=now() WHERE id=$1 AND user_id=$3 AND state='pending' RETURNING *",[intent.id,signature,userId],c);
    if(!updated){
      const existing=await one<any>('SELECT * FROM clip_plan_intents WHERE id=$1 AND user_id=$2',[intent.id,userId],c);
      if(existing?.state==='verified') return existing;
      throw new ApiError('CLIP_PLAN_INTENT_CONFLICT',409);
    }
    await c.query(`INSERT INTO clip_plans(user_id,status,plan_name,deposit_lamports,deposit_signature,treasury,period_start,period_end,clips_used,credit_limit_units,credits_used_units)
      VALUES($1,'active',$5,$2,$3,$4,now(),now()+interval '1 year',0,$6,0)
      ON CONFLICT(user_id) DO UPDATE SET status='active',plan_name=EXCLUDED.plan_name,deposit_lamports=EXCLUDED.deposit_lamports,
      deposit_signature=EXCLUDED.deposit_signature,treasury=EXCLUDED.treasury,period_start=EXCLUDED.period_start,
      period_end=EXCLUDED.period_end,clips_used=0,credit_limit_units=EXCLUDED.credit_limit_units,credits_used_units=0,updated_at=now()`,[userId,intent.amount_lamports,signature,intent.destination,PLAN_NAME,PLAN_CREDITS]);
    await c.query(`INSERT INTO ai_usage_accounts(user_id,free_units,balance_units,consumed_units)
      VALUES($1,0,$2,0) ON CONFLICT(user_id) DO UPDATE SET free_units=0,balance_units=$2,updated_at=now()`,[userId,PLAN_CREDITS]);
    await c.query("INSERT INTO audit_events(actor_id,action,subject_type,subject_id,detail) VALUES($1,'clip_plan.verified','user',$1,$2)",[userId,JSON.stringify({signature,amountLamports:String(intent.amount_lamports),plan:PLAN_NAME,credits:PLAN_CREDITS})]);
    return updated;
  });
}
