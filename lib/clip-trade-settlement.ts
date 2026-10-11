import bs58 from 'bs58';
import {Connection,ParsedInstruction,PartiallyDecodedInstruction} from '@solana/web3.js';
import {db,one,tx} from './db';
import {config} from './config';
import {MEMO_PROGRAM_ID,tradeMemo,solscanUrl} from './trading';

type TradeIntent={id:string;user_id:string;wallet_address:string;mint:string;side:'buy'|'sell';clip_link_id:string|null;clipper_user_id:string|null;streamer_user_id:string|null;fee_lamports:string|number;clipper_lamports:string|number;streamer_lamports:string|number;platform_lamports:string|number;treasury_address:string|null;state:string;credits_recorded_at:string|null;signature:string};
function memoText(ix:ParsedInstruction|PartiallyDecodedInstruction):string|null{
  if(ix.programId.toBase58()!==MEMO_PROGRAM_ID)return null;
  if('parsed' in ix&&typeof ix.parsed==='string')return ix.parsed;
  if(!('parsed' in ix)&&'data' in ix){try{return Buffer.from(bs58.decode(ix.data)).toString('utf8');}catch{return null;}}
  return null;
}
function hasFeeTransfer(chainTx:any,intent:TradeIntent){
  return (chainTx.transaction.message.instructions||[]).some((ix:any)=>ix.program==='system'&&ix.parsed?.type==='transfer'&&ix.parsed.info?.source===intent.wallet_address&&ix.parsed.info?.destination===intent.treasury_address&&BigInt(ix.parsed.info?.lamports||0)===BigInt(intent.fee_lamports));
}
function hasTokenMovement(chainTx:any,intent:TradeIntent){
  const totals=(items:any[])=>items.filter((item:any)=>item.mint===intent.mint&&item.owner===intent.wallet_address).reduce((sum:bigint,item:any)=>sum+BigInt(item.uiTokenAmount?.amount||'0'),0n);
  const before=totals(chainTx.meta?.preTokenBalances||[]),after=totals(chainTx.meta?.postTokenBalances||[]);
  return intent.side==='buy'?after>before:before>after;
}

export async function reconcileTradeIntent(intent:TradeIntent){
  if(intent.state==='confirmed')return {status:'confirmed',attributionRecorded:Boolean(intent.credits_recorded_at),error:null,solscanUrl:solscanUrl(intent.signature)};
  const connection=new Connection(config.rpc,'confirmed');
  const status=(await connection.getSignatureStatuses([intent.signature],{searchTransactionHistory:true})).value[0];
  if(status?.err){await db.query("UPDATE trade_intents SET state='failed',updated_at=now() WHERE id=$1 AND state<>'confirmed'",[intent.id]);return {status:'failed',attributionRecorded:false,error:status.err,solscanUrl:solscanUrl(intent.signature)};}
  if(!status||!['confirmed','finalized'].includes(status.confirmationStatus||''))return {status:status?.confirmationStatus||'pending',attributionRecorded:false,error:null,solscanUrl:solscanUrl(intent.signature)};
  const chainTx=await connection.getParsedTransaction(intent.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
  if(!chainTx)return {status:'confirmed',attributionRecorded:false,error:null,solscanUrl:solscanUrl(intent.signature)};
  const signer=chainTx.transaction.message.accountKeys.find((key:any)=>key.signer)?.pubkey?.toBase58?.()||'';
  const hasMemo=chainTx.transaction.message.instructions.some(ix=>memoText(ix as ParsedInstruction|PartiallyDecodedInstruction)===tradeMemo(intent.id,intent.clip_link_id||undefined));
  if(signer!==intent.wallet_address||!hasMemo||chainTx.meta?.err||!hasTokenMovement(chainTx,intent)){
    await db.query("UPDATE trade_intents SET state='failed',updated_at=now() WHERE id=$1 AND state<>'confirmed'",[intent.id]);
    return {status:'confirmed',attributionRecorded:false,error:{code:'TRADE_INTENT_VERIFICATION_FAILED'},solscanUrl:solscanUrl(intent.signature)};
  }
  const fee=BigInt(intent.fee_lamports||0);
  if(fee>0n&&!hasFeeTransfer(chainTx,intent)){
    await db.query("UPDATE trade_intents SET state='failed',updated_at=now() WHERE id=$1 AND state<>'confirmed'",[intent.id]);
    return {status:'confirmed',attributionRecorded:false,error:{code:'FEE_TRANSFER_NOT_VERIFIED'},solscanUrl:solscanUrl(intent.signature)};
  }
  if(fee<=0n){await db.query("UPDATE trade_intents SET state='confirmed',confirmed_at=COALESCE(confirmed_at,now()),updated_at=now() WHERE id=$1 AND state<>'confirmed'",[intent.id]);return {status:status.confirmationStatus||'confirmed',attributionRecorded:false,error:null,solscanUrl:solscanUrl(intent.signature)};}
  await tx(async client=>{
    const locked=await one<any>('SELECT * FROM trade_intents WHERE id=$1 FOR UPDATE',[intent.id],client);
    if(!locked||locked.state==='confirmed')return;
    const recipients=await client.query<{user_id:string;wallet:string|null}>(`SELECT u.id AS user_id,w.address AS wallet FROM users u LEFT JOIN LATERAL (SELECT address FROM wallets WHERE user_id=u.id ORDER BY is_primary DESC,updated_at DESC LIMIT 1) w ON true WHERE u.id=ANY($1::uuid[])`,[[locked.clipper_user_id,locked.streamer_user_id]]);
    const walletByUser=new Map(recipients.rows.map(row=>[row.user_id,row.wallet]));
    await client.query("UPDATE trade_intents SET state='confirmed',confirmed_at=COALESCE(confirmed_at,now()),credits_recorded_at=COALESCE(credits_recorded_at,now()),updated_at=now() WHERE id=$1",[locked.id]);
    for(const [role,recipient,amount] of [['clipper',locked.clipper_user_id,locked.clipper_lamports],['streamer',locked.streamer_user_id,locked.streamer_lamports],['platform',null,locked.platform_lamports]] as const){
      if(BigInt(amount||0)<=0n)continue;
      await client.query(`INSERT INTO clip_earnings_ledger(trade_intent_id,user_id,wallet_address,beneficiary_role,lamports)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(trade_intent_id,beneficiary_role) DO NOTHING`,[locked.id,recipient,role==='platform'?locked.treasury_address:walletByUser.get(recipient!)||null,role,amount]);
    }
  });
  return {status:status.confirmationStatus||'confirmed',attributionRecorded:true,error:null,solscanUrl:solscanUrl(intent.signature)};
}
