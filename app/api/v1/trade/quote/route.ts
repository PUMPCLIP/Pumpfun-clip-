import crypto from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import {ApiError,requireUser,jsonError} from '@/lib/auth';
import {one} from '@/lib/db';
import {getTradeQuote,parseTradeInput} from '@/lib/trading';
import {calculateClipFee} from '@/lib/clip-attribution';
import {resolveClipTradeAttribution} from '@/lib/clip-trade-attribution';
import {config} from '@/lib/config';
export const runtime='nodejs';

export async function GET(request:Request){try{
  const user=await requireUser(),query=new URL(request.url).searchParams;
  const input=parseTradeInput({mint:query.get('mint'),wallet:query.get('wallet'),side:query.get('side')||'buy',amountRaw:query.get('amountRaw'),slippageBps:Number(query.get('slippageBps')||100),clipLinkId:query.get('clipLinkId')||undefined});
  const wallet=await one<{address:string}>('SELECT address FROM wallets WHERE user_id=$1 AND address=$2 AND is_primary=true LIMIT 1',[user.user_id,input.wallet]);
  if(!wallet)throw new ApiError('TRADE_WALLET_NOT_LINKED',403,'Use the linked primary wallet for this account.');
  const quote=await getTradeQuote(input);
  if(!input.clipLinkId)return Response.json({...quote,feeBps:0,feeLamports:'0',clipperLamports:'0',streamerLamports:'0',platformLamports:'0',feeTreasury:null});
  await resolveClipTradeAttribution(input.clipLinkId,input.mint);
  try{new PublicKey(config.solTreasury);}catch{throw new ApiError('CLIP_FEE_TREASURY_REQUIRED',503,'Set the public SOL treasury address before enabling attributed buys.');}
  const fee=calculateClipFee(input.amountRaw);
  return Response.json({...quote,feeBps:100,feeLamports:fee.total.toString(),clipperLamports:fee.clipper.toString(),streamerLamports:fee.streamer.toString(),platformLamports:fee.platform.toString(),feeTreasury:config.solTreasury});
}catch(error){return jsonError(error,crypto.randomUUID());}}
