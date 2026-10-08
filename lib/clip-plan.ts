import {db,one,tx} from './db';
import {config} from './config';
import {ApiError} from './auth';

export const CLIP_COST_UNITS=5;
export const TRIAL_CLIPS=2;
export const MONTHLY_CLIPS=20;
export const PLAN_SOL_LAMPORTS=2_000_000_000n;

export function clipPlanPaymentConfig(){
  if(!config.solTreasury) throw new ApiError('CLIP_PLAN_NOT_CONFIGURED',503,'The 2 SOL clip plan is not configured yet.');
  return {amountLamports:PLAN_SOL_LAMPORTS.toString(),amountSol:'2',destination:config.solTreasury,network:config.cluster};
}

export async function clipPlanStatus(userId:string){
  await db.query('INSERT INTO ai_usage_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[userId]);
  const wallet=await one<{address:string}>('SELECT address FROM wallets WHERE user_id=$1 ORDER BY is_primary DESC,updated_at DESC LIMIT 1',[userId]);
  const account=await one<any>('SELECT free_units FROM ai_usage_accounts WHERE user_id=$1',[userId]);
  const plan=await one<any>('SELECT status,plan_name,deposit_lamports,period_start,period_end,clips_used,deposit_signature FROM clip_plans WHERE user_id=$1',[userId]);
  const active=plan?.status==='active' && plan.period_end && new Date(plan.period_end).getTime()>Date.now();
  if(plan?.status==='active'&&!active) await db.query("UPDATE clip_plans SET status='expired',updated_at=now() WHERE user_id=$1 AND status='active' AND period_end<=now()",[userId]);
  return {
    trial:{total:TRIAL_CLIPS,remaining:Math.min(TRIAL_CLIPS,Math.floor(Number(account?.free_units||0)/CLIP_COST_UNITS))},
    wallet:wallet?.address||null,
    plan:active?{status:'active',name:plan.plan_name,monthlyClips:MONTHLY_CLIPS,used:Number(plan.clips_used),remaining:Math.max(0,MONTHLY_CLIPS-Number(plan.clips_used)),periodStart:plan.period_start,periodEnd:plan.period_end}:null,
    payment:config.solTreasury?{amountLamports:PLAN_SOL_LAMPORTS.toString(),amountSol:'2',destination:config.solTreasury,network:config.cluster}:null,
  };
}

export async function reservePlanClip(userId:string,conn:any){
  const plan=await one<any>('SELECT * FROM clip_plans WHERE user_id=$1 FOR UPDATE',[userId],conn);
  if(!plan||plan.status!=='active'||!plan.period_end||new Date(plan.period_end).getTime()<=Date.now()) return false;
  if(Number(plan.clips_used)>=MONTHLY_CLIPS) throw new ApiError('CLIP_PLAN_LIMIT_REACHED',402,'Your 20-clip monthly allowance is used. Renew the 2 SOL plan to continue clipping.');
  await conn.query('UPDATE clip_plans SET clips_used=clips_used+1,updated_at=now() WHERE user_id=$1',[userId]);
  return true;
}

export async function releasePlanClip(userId:string,conn:any){
  await conn.query('UPDATE clip_plans SET clips_used=GREATEST(clips_used-1,0),updated_at=now() WHERE user_id=$1 AND status=\'active\'',[userId]);
}

export async function activateClipPlan(userId:string,intent:any,signature:string){
  return tx(async c=>{
    const updated=await one<any>("UPDATE clip_plan_intents SET state='verified',signature=$2,updated_at=now() WHERE id=$1 AND user_id=$3 AND state='pending' RETURNING *",[intent.id,signature,userId],c);
    if(!updated){
      const existing=await one<any>('SELECT * FROM clip_plan_intents WHERE id=$1 AND user_id=$2',[intent.id,userId],c);
      if(existing?.state==='verified') return existing;
      throw new ApiError('CLIP_PLAN_INTENT_CONFLICT',409);
    }
    await c.query(`INSERT INTO clip_plans(user_id,status,plan_name,deposit_lamports,deposit_signature,treasury,period_start,period_end,clips_used)
      VALUES($1,'active','monthly_20',$2,$3,$4,now(),now()+interval '1 month',0)
      ON CONFLICT(user_id) DO UPDATE SET status='active',plan_name='monthly_20',deposit_lamports=EXCLUDED.deposit_lamports,
      deposit_signature=EXCLUDED.deposit_signature,treasury=EXCLUDED.treasury,period_start=EXCLUDED.period_start,
      period_end=EXCLUDED.period_end,clips_used=0,updated_at=now()`,[userId,intent.amount_lamports,signature,intent.destination]);
    await c.query("INSERT INTO audit_events(actor_id,action,subject_type,subject_id,detail) VALUES($1,'clip_plan.verified','user',$1,$2)",[userId,JSON.stringify({signature,amountLamports:String(intent.amount_lamports),plan:'monthly_20'})]);
    return updated;
  });
}
