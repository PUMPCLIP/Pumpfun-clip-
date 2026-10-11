import crypto from 'node:crypto';
import {db,one,tx} from '@/lib/db';
import {requireUser,jsonError} from '@/lib/auth';
import {Connection} from '@solana/web3.js';
import {config} from '@/lib/config';
import {reconcileTradeIntent} from '@/lib/clip-trade-settlement';
export const runtime='nodejs';

async function reconcile(userId:string){
  const pending=await db.query<any>("SELECT * FROM clip_earnings_withdrawals WHERE user_id=$1 AND state IN ('prepared','broadcast') ORDER BY created_at ASC LIMIT 20",[userId]);
  if(!pending.rows.length)return;
  const connection=new Connection(config.rpc,'confirmed');
  for(const row of pending.rows){
    if(!row.signature)continue;
    try{
      const status=(await connection.getSignatureStatuses([row.signature],{searchTransactionHistory:true})).value[0];
      if(status?.err){await tx(async client=>{await client.query("UPDATE clip_earnings_withdrawals SET state='failed',updated_at=now() WHERE id=$1 AND state IN ('prepared','broadcast')",[row.id]);await client.query("UPDATE clip_earnings_ledger SET status='accrued',withdrawal_id=NULL WHERE withdrawal_id=$1 AND status='reserved'",[row.id]);});continue;}
      if(!status){const height=await connection.getBlockHeight('confirmed');if(height>Number(row.last_valid_block_height)){await tx(async client=>{await client.query("UPDATE clip_earnings_withdrawals SET state='failed',updated_at=now() WHERE id=$1 AND state IN ('prepared','broadcast')",[row.id]);await client.query("UPDATE clip_earnings_ledger SET status='accrued',withdrawal_id=NULL WHERE withdrawal_id=$1 AND status='reserved'",[row.id]);});}continue;}
      if(!['confirmed','finalized'].includes(status.confirmationStatus||''))continue;
      const chainTx=await connection.getParsedTransaction(row.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
      const matched=chainTx&&!chainTx.meta?.err&&chainTx.transaction.message.instructions.some((ix:any)=>ix.program==='system'&&ix.parsed?.type==='transfer'&&ix.parsed.info?.source===config.solTreasury&&ix.parsed.info?.destination===row.destination&&BigInt(ix.parsed.info?.lamports||0)===BigInt(row.lamports));
      if(!matched)continue;
      await tx(async client=>{await client.query("UPDATE clip_earnings_withdrawals SET state='paid',paid_at=COALESCE(paid_at,now()),updated_at=now() WHERE id=$1 AND state IN ('prepared','broadcast')",[row.id]);await client.query("UPDATE clip_earnings_ledger SET status='paid',paid_at=COALESCE(paid_at,now()) WHERE withdrawal_id=$1 AND status='reserved'",[row.id]);});
    }catch(error){console.error('earnings withdrawal reconciliation',row.id,error);}
  }
}

export async function GET(){try{
  const user=await requireUser();
  const unsettled=await db.query<any>("SELECT * FROM trade_intents WHERE user_id=$1 AND state='submitted' AND signature IS NOT NULL ORDER BY updated_at DESC LIMIT 20",[user.user_id]);
  await Promise.all(unsettled.rows.map((intent:any)=>reconcileTradeIntent(intent).catch(error=>{console.error('clip trade reconciliation',intent.id,error);return null;})));
  await reconcile(user.user_id);
  const [summary,history,withdrawals]=await Promise.all([
    db.query(`SELECT beneficiary_role,status,sum(lamports)::text AS lamports FROM clip_earnings_ledger WHERE user_id=$1 GROUP BY beneficiary_role,status`,[user.user_id]),
    db.query(`SELECT l.id,l.trade_intent_id,l.beneficiary_role,l.lamports::text,l.status,l.wallet_address,l.created_at,l.paid_at,t.mint,t.side,t.signature,t.confirmed_at
      FROM clip_earnings_ledger l JOIN trade_intents t ON t.id=l.trade_intent_id WHERE l.user_id=$1 ORDER BY l.created_at DESC LIMIT 100`,[user.user_id]),
    db.query('SELECT id,destination,lamports::text,state,signature,created_at,paid_at FROM clip_earnings_withdrawals WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',[user.user_id])
  ]);
  const totals={accrued:'0',reserved:'0',paid:'0',clipper:'0',streamer:'0'};
  const add=(left:string,right:string)=>String(BigInt(left)+BigInt(right));
  for(const row of summary.rows){if(row.status in totals)(totals as any)[row.status]=add((totals as any)[row.status],row.lamports);if(row.beneficiary_role in totals)(totals as any)[row.beneficiary_role]=add((totals as any)[row.beneficiary_role],row.lamports);}
  return Response.json({totals,history:history.rows,withdrawals:withdrawals.rows,withdrawalsEnabled:Boolean(process.env.SOL_TREASURY_PRIVATE_KEY&&config.solTreasury),treasury:config.solTreasury||null});
}catch(error){return jsonError(error,crypto.randomUUID());}}
