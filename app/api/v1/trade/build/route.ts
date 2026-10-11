import crypto from 'node:crypto';
import {db} from '@/lib/db';
import {ApiError,mutation,jsonError} from '@/lib/auth';
import {buildTradeTransaction,parseTradeInput} from '@/lib/trading';
export const runtime='nodejs';

export async function POST(request:Request){
  try{
    const user=await mutation(request);
    const data=await request.json().catch(()=>null);
    const input=parseTradeInput(data);
    const wallet=await db.query<{address:string}>('SELECT address FROM wallets WHERE user_id=$1 AND address=$2 AND is_primary=true LIMIT 1',[user.user_id,input.wallet]);
    if(!wallet.rows[0]) throw new ApiError('TRADE_WALLET_NOT_LINKED',403,'Use the linked primary wallet for this account.');
    return Response.json(await buildTradeTransaction(input));
  }catch(error){return jsonError(error,crypto.randomUUID());}
}
