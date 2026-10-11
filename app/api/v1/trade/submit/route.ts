import crypto from 'node:crypto';
import {db} from '@/lib/db';
import {ApiError,mutation,jsonError} from '@/lib/auth';
import {assertTradingEnabled,decodeSignedTransaction,solscanUrl,walletAddress} from '@/lib/trading';
import {Connection,PublicKey} from '@solana/web3.js';
import {config} from '@/lib/config';
export const runtime='nodejs';

export async function POST(request:Request){
  try{
    assertTradingEnabled();
    const user=await mutation(request);
    const data=await request.json().catch(()=>null) as Record<string,unknown>|null;
    const wallet=String(data?.wallet||'');
    const signed=String(data?.signedTransaction||'');
    try{new PublicKey(wallet);}catch{throw new Error('INVALID_ADDRESS');}
    const linked=await db.query<{address:string}>('SELECT address FROM wallets WHERE user_id=$1 AND address=$2 AND is_primary=true LIMIT 1',[user.user_id,wallet]);
    if(!linked.rows[0]) throw new ApiError('TRADE_WALLET_NOT_LINKED',403,'Use the linked primary wallet for this account.');
    const transaction=decodeSignedTransaction(signed);
    if(walletAddress(transaction)!==wallet) throw new ApiError('TRANSACTION_WALLET_MISMATCH',422);
    const signature=await new Connection(config.rpc,'confirmed').sendRawTransaction(transaction.serialize(),{skipPreflight:false,maxRetries:2});
    return Response.json({signature,solscanUrl:solscanUrl(signature),status:'submitted'});
  }catch(error){return jsonError(error,crypto.randomUUID());}
}
