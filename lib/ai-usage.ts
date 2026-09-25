import {db,one,tx} from './db';
import {ApiError} from './auth';

export const AI_UNIT_COSTS={highlight_analysis:1,openclip_clip:5} as const;
export type AiAction=keyof typeof AI_UNIT_COSTS;
export async function reserveAiUnits(userId:string,action:AiAction,key:string,metadata:object={}){
  return tx(async c=>{
    const existing=await one<any>('SELECT * FROM ai_usage_ledger WHERE user_id=$1 AND idempotency_key=$2',[userId,key],c);
    if(existing) return existing;
    const units=AI_UNIT_COSTS[action];
    await c.query('INSERT INTO ai_usage_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[userId]);
    const account=await one<any>('SELECT * FROM ai_usage_accounts WHERE user_id=$1 FOR UPDATE',[userId],c);
    const available=Number(account.free_units)+Number(account.balance_units);
    if(available<units) throw new ApiError('AI_CREDITS_REQUIRED',402,'Not enough AI credits. Add credits or wait for your free tier to renew.');
    const free=Math.min(Number(account.free_units),units),paid=units-free;
    await c.query('UPDATE ai_usage_accounts SET free_units=free_units-$2,balance_units=balance_units-$3,updated_at=now() WHERE user_id=$1',[userId,free,paid]);
    return one<any>('INSERT INTO ai_usage_ledger(user_id,action,units,status,idempotency_key,metadata) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[userId,action,units,'reserved',key,JSON.stringify({...metadata,freeUnits:free,paidUnits:paid})],c);
  });
}
export async function settleAiUnits(ledgerId:string,status:'consumed'|'released'|'refunded'){
  return tx(async c=>{
    const ledger=await one<any>('SELECT * FROM ai_usage_ledger WHERE id=$1 FOR UPDATE',[ledgerId],c);
    if(!ledger||ledger.status!== 'reserved') return ledger;
    if(status==='consumed') await c.query('UPDATE ai_usage_accounts SET consumed_units=consumed_units+$2,updated_at=now() WHERE user_id=$1',[ledger.user_id,ledger.units]);
    else {
      const paidUnits=Number(ledger.metadata?.paidUnits||0),freeUnits=Number(ledger.metadata?.freeUnits||0);
      await c.query('UPDATE ai_usage_accounts SET free_units=free_units+$2,balance_units=balance_units+$3,updated_at=now() WHERE user_id=$1',[ledger.user_id,freeUnits,paidUnits]);
    }
    return one<any>('UPDATE ai_usage_ledger SET status=$2 WHERE id=$1 RETURNING *',[ledgerId,status],c);
  });
}
export async function usageSummary(userId:string){
  await db.query('INSERT INTO ai_usage_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[userId]);
  return one<any>('SELECT free_units,balance_units,consumed_units FROM ai_usage_accounts WHERE user_id=$1',[userId]);
}
export async function requireAdmin(userId:string){
  const user=await one<{is_admin:boolean}>('SELECT is_admin FROM users WHERE id=$1',[userId]);
  if(!user?.is_admin) throw new ApiError('ADMIN_REQUIRED',403);
}
