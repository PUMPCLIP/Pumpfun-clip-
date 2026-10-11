import crypto from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {db} from '@/lib/db';
import {ApiError,mutation,jsonError} from '@/lib/auth';
import {buildTradeTransaction,decodeSignedTransaction,parseTradeInput,tradeMessageHash} from '@/lib/trading';
import {calculateClipFee} from '@/lib/clip-attribution';
import {resolveClipTradeAttribution} from '@/lib/clip-trade-attribution';
import {config} from '@/lib/config';
export const runtime='nodejs';

export async function POST(request:Request){try{
  const user=await mutation(request),input=parseTradeInput(await request.json().catch(()=>null));
  const linked=await db.query<{address:string}>('SELECT address FROM wallets WHERE user_id=$1 AND address=$2 AND is_primary=true LIMIT 1',[user.user_id,input.wallet]);
  if(!linked.rows[0])throw new ApiError('TRADE_WALLET_NOT_LINKED',403,'Use the linked primary wallet for this account.');
  let attribution:null|Awaited<ReturnType<typeof resolveClipTradeAttribution>>=null;
  let fee={total:0n,clipper:0n,streamer:0n,platform:0n};
  if(input.clipLinkId){
    if(input.side!=='buy')throw new ApiError('CLIP_ATTRIBUTION_BUY_ONLY',422);
    attribution=await resolveClipTradeAttribution(input.clipLinkId,input.mint);
    fee=calculateClipFee(input.amountRaw);
    try{new PublicKey(config.solTreasury);}catch{throw new ApiError('CLIP_FEE_TREASURY_REQUIRED',503,'Set the public SOL treasury address before enabling attributed buys.');}
  }
  const intentId=crypto.randomUUID();
  const built=await buildTradeTransaction(input,{intentId,clipLinkId:input.clipLinkId,feeLamports:fee.total.toString(),feeTreasury:attribution?config.solTreasury:undefined});
  const transaction=decodeSignedTransaction(built.serializedTransaction),messageHash=tradeMessageHash(transaction);
  await db.query(`INSERT INTO trade_intents(id,user_id,wallet_address,mint,side,amount_raw,route,clip_link_id,clipper_user_id,streamer_user_id,campaign_id,stream_alert_event_id,
      fee_bps,fee_lamports,clipper_lamports,streamer_lamports,platform_lamports,treasury_address,message_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [intentId,user.user_id,input.wallet,input.mint,input.side,input.amountRaw,built.route,input.clipLinkId||null,attribution?.clipperUserId||null,attribution?.streamerUserId||null,attribution?.campaignId||null,attribution?.streamAlertEventId||null,
      attribution?100:0,fee.total.toString(),fee.clipper.toString(),fee.streamer.toString(),fee.platform.toString(),attribution?config.solTreasury:null,messageHash]);
  return Response.json({...built,intentId,feeBps:attribution?100:0,feeLamports:fee.total.toString(),clipperLamports:fee.clipper.toString(),streamerLamports:fee.streamer.toString(),platformLamports:fee.platform.toString(),feeTreasury:attribution?config.solTreasury:null});
}catch(error){return jsonError(error,crypto.randomUUID());}}
