import crypto from 'node:crypto';
import bs58 from 'bs58';
import {db,one} from '@/lib/db';
import {ApiError,mutation,jsonError} from '@/lib/auth';
import {assertTradingEnabled,decodeSignedTransaction,solscanUrl,tradeMessageHash,walletAddress} from '@/lib/trading';
import {Connection,PublicKey} from '@solana/web3.js';
import {config} from '@/lib/config';
export const runtime='nodejs';

export async function POST(request:Request){try{
  assertTradingEnabled();
  const user=await mutation(request),data=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const wallet=String(data?.wallet||''),intentId=String(data?.intentId||''),signed=String(data?.signedTransaction||''),directSignature=String(data?.signature||'');
  try{new PublicKey(wallet);}catch{throw new ApiError('INVALID_ADDRESS',422);}
  if(!/^[0-9a-f-]{36}$/i.test(intentId))throw new ApiError('INVALID_TRADE_INTENT',422);
  const linked=await one('SELECT address FROM wallets WHERE user_id=$1 AND address=$2 AND is_primary=true LIMIT 1',[user.user_id,wallet]);
  if(!linked)throw new ApiError('TRADE_WALLET_NOT_LINKED',403,'Use the linked primary wallet for this account.');
  const intent=await one<any>('SELECT * FROM trade_intents WHERE id=$1 AND user_id=$2',[intentId,user.user_id]);
  if(!intent||intent.wallet_address!==wallet)throw new ApiError('TRADE_INTENT_NOT_FOUND',404);
  if(directSignature){
    if(!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(directSignature))throw new ApiError('INVALID_SIGNATURE',422);
    await db.query(`UPDATE trade_intents SET signature=$3,state='submitted',updated_at=now() WHERE id=$1 AND user_id=$2 AND state IN ('built','submitted') AND (signature IS NULL OR signature=$3)`,[intentId,user.user_id,directSignature]);
    const saved=await one<any>('SELECT signature FROM trade_intents WHERE id=$1 AND user_id=$2',[intentId,user.user_id]);
    if(saved?.signature!==directSignature)throw new ApiError('TRADE_INTENT_ALREADY_USED',409);
    return Response.json({intentId,signature:directSignature,solscanUrl:solscanUrl(directSignature),status:'submitted'});
  }
  if(!signed)throw new ApiError('SIGNED_TRANSACTION_REQUIRED',422);
  const transaction=decodeSignedTransaction(signed);
  if(walletAddress(transaction)!==wallet)throw new ApiError('TRANSACTION_WALLET_MISMATCH',422);
  if(tradeMessageHash(transaction)!==intent.message_hash)throw new ApiError('TRADE_MESSAGE_MISMATCH',422,'The wallet-signed transaction does not match the quoted trade intent.');
  if(!transaction.signatures[0]||transaction.signatures[0].every(byte=>byte===0))throw new ApiError('TRANSACTION_SIGNATURE_REQUIRED',422);
  const signature=bs58.encode(transaction.signatures[0]);
  await db.query(`UPDATE trade_intents SET signature=$3,state='submitted',updated_at=now() WHERE id=$1 AND user_id=$2 AND state IN ('built','submitted') AND (signature IS NULL OR signature=$3)`,[intentId,user.user_id,signature]);
  const saved=await one<any>('SELECT signature FROM trade_intents WHERE id=$1 AND user_id=$2',[intentId,user.user_id]);
  if(saved?.signature!==signature)throw new ApiError('TRADE_INTENT_ALREADY_USED',409);
  const broadcast=await new Connection(config.rpc,'confirmed').sendRawTransaction(transaction.serialize(),{skipPreflight:false,maxRetries:2});
  if(broadcast!==signature)throw new ApiError('TRANSACTION_SIGNATURE_MISMATCH',502);
  return Response.json({intentId,signature,solscanUrl:solscanUrl(signature),status:'submitted'});
}catch(error){return jsonError(error,crypto.randomUUID());}}
