import crypto from 'node:crypto';
import bs58 from 'bs58';
import {Connection,Keypair,PublicKey,SystemProgram,Transaction} from '@solana/web3.js';
import {db,one,tx} from '@/lib/db';
import {ApiError,mutation,jsonError} from '@/lib/auth';
import {config} from '@/lib/config';
export const runtime='nodejs';

function treasurySigner(){
  const encoded=process.env.SOL_TREASURY_PRIVATE_KEY||'';
  if(!encoded)throw new ApiError('EARNINGS_WITHDRAWALS_NOT_CONFIGURED',503,'On-demand withdrawals are not enabled on this deployment.');
  try{const signer=Keypair.fromSecretKey(bs58.decode(encoded));if(signer.publicKey.toBase58()!==config.solTreasury)throw new Error('mismatch');return signer;}catch{throw new ApiError('EARNINGS_TREASURY_KEY_INVALID',503,'The treasury withdrawal signer is not valid or does not match SOL_TREASURY.');}
}
async function sendSaved(row:any){
  const connection=new Connection(config.rpc,'confirmed');
  const status=(await connection.getSignatureStatuses([row.signature],{searchTransactionHistory:true})).value[0];
  if(status?.err){await tx(async client=>{await client.query("UPDATE clip_earnings_withdrawals SET state='failed',updated_at=now() WHERE id=$1 AND state IN ('prepared','broadcast')",[row.id]);await client.query("UPDATE clip_earnings_ledger SET status='accrued',withdrawal_id=NULL WHERE withdrawal_id=$1 AND status='reserved'",[row.id]);});throw new ApiError('WITHDRAWAL_ONCHAIN_FAILED',409,'The previous withdrawal transaction failed; its credits are available again.');}
  if(status?.confirmationStatus==='confirmed'||status?.confirmationStatus==='finalized')return row;
  if(status){await db.query("UPDATE clip_earnings_withdrawals SET state='broadcast',updated_at=now() WHERE id=$1 AND state='prepared'",[row.id]);return {...row,state:'broadcast'};}
  if(await connection.getBlockHeight('confirmed')>Number(row.last_valid_block_height)){await tx(async client=>{await client.query("UPDATE clip_earnings_withdrawals SET state='failed',updated_at=now() WHERE id=$1 AND state IN ('prepared','broadcast')",[row.id]);await client.query("UPDATE clip_earnings_ledger SET status='accrued',withdrawal_id=NULL WHERE withdrawal_id=$1 AND status='reserved'",[row.id]);});throw new ApiError('WITHDRAWAL_EXPIRED',409,'The previous withdrawal expired before confirmation; its credits are available again.');}
  try{await connection.sendRawTransaction(Buffer.from(row.signed_transaction,'base64'),{skipPreflight:false,maxRetries:2});}
  catch(error){const after=(await connection.getSignatureStatuses([row.signature],{searchTransactionHistory:true})).value[0];if(!after)throw error;}
  await db.query("UPDATE clip_earnings_withdrawals SET state='broadcast',updated_at=now() WHERE id=$1 AND state='prepared'",[row.id]);
  return {...row,state:'broadcast'};
}

export async function POST(request:Request){try{
  const user=await mutation(request),signer=treasurySigner();
  const idempotencyKey=request.headers.get('idempotency-key')||'';
  if(!/^[0-9a-f-]{36}$/i.test(idempotencyKey))throw new ApiError('IDEMPOTENCY_KEY_REQUIRED',400);
  const existing=await one<any>('SELECT * FROM clip_earnings_withdrawals WHERE user_id=$1 AND idempotency_key=$2',[user.user_id,idempotencyKey]);
  if(existing){if(existing.state==='paid')return Response.json({withdrawalId:existing.id,signature:existing.signature,state:'paid'});if(existing.state==='failed')throw new ApiError('WITHDRAWAL_PREVIOUSLY_FAILED',409,'Refresh the dashboard and start a new withdrawal request.');const sent=await sendSaved(existing);return Response.json({withdrawalId:sent.id,signature:sent.signature,state:sent.state},{status:202});}
  const wallet=await one<any>('SELECT address FROM wallets WHERE user_id=$1 AND is_primary=true ORDER BY updated_at DESC LIMIT 1',[user.user_id]);
  if(!wallet)throw new ApiError('WALLET_REQUIRED',403,'Link a primary wallet before withdrawing credits.');
  const destination=new PublicKey(wallet.address),connection=new Connection(config.rpc,'confirmed');
  const next=await connection.getLatestBlockhash('confirmed');
  const client=await db.connect();let row:any;
  try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[user.user_id]);
    const duplicate=await one<any>('SELECT * FROM clip_earnings_withdrawals WHERE user_id=$1 AND idempotency_key=$2 FOR UPDATE',[user.user_id,idempotencyKey],client);
    if(duplicate){row=duplicate;await client.query('COMMIT');}
    else{
      const credits=await client.query<any>("SELECT id,lamports FROM clip_earnings_ledger WHERE user_id=$1 AND status='accrued' ORDER BY created_at,id FOR UPDATE",[user.user_id]);
      const total=credits.rows.reduce((sum:bigint,item:any)=>sum+BigInt(item.lamports),0n);
      if(total<=0n)throw new ApiError('NO_WITHDRAWABLE_EARNINGS',409,'There are no accrued clip earnings available to withdraw.');
      if(total>BigInt(Number.MAX_SAFE_INTEGER))throw new ApiError('WITHDRAWAL_AMOUNT_TOO_LARGE',422);
      const amount=Number(total);
      if(await connection.getBalance(signer.publicKey,'confirmed')<amount+10000)throw new ApiError('TREASURY_BALANCE_TOO_LOW',409,'The SOL treasury cannot currently cover this withdrawal and network fees.');
      const transaction=new Transaction().add(SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:destination,lamports:amount}));
      transaction.feePayer=signer.publicKey;transaction.recentBlockhash=next.blockhash;transaction.sign(signer);
      const signed=transaction.serialize(),signature=bs58.encode(transaction.signature!);
      row=await one<any>(`INSERT INTO clip_earnings_withdrawals(user_id,destination,lamports,idempotency_key,signed_transaction,blockhash,last_valid_block_height,signature,state)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'prepared') RETURNING *`,[user.user_id,destination.toBase58(),total.toString(),idempotencyKey,signed.toString('base64'),next.blockhash,next.lastValidBlockHeight,signature],client);
      const ids=credits.rows.map((item:any)=>item.id);
      await client.query("UPDATE clip_earnings_ledger SET status='reserved',withdrawal_id=$2 WHERE id=ANY($1::uuid[])",[ids,row!.id]);
      await client.query('COMMIT');
    }
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  if(row.state==='paid')return Response.json({withdrawalId:row.id,signature:row.signature,state:'paid'});
  const sent=await sendSaved(row);
  return Response.json({withdrawalId:sent.id,signature:sent.signature,state:sent.state},{status:202});
}catch(error){return jsonError(error,crypto.randomUUID());}}
