import crypto from 'node:crypto';
import {ApiError,requireUser,jsonError} from '@/lib/auth';
import {one} from '@/lib/db';
import {getTradeQuote,parseTradeInput} from '@/lib/trading';
export const runtime='nodejs';

export async function GET(request:Request){
  try{
    const user=await requireUser();
    const query=new URL(request.url).searchParams;
    const input=parseTradeInput({mint:query.get('mint'),wallet:query.get('wallet'),side:query.get('side')||'buy',amountRaw:query.get('amountRaw'),slippageBps:Number(query.get('slippageBps')||100)});
    const wallet=await one<{address:string}>('SELECT address FROM wallets WHERE user_id=$1 AND address=$2 AND is_primary=true LIMIT 1',[user.user_id,input.wallet]);
    if(!wallet) throw new ApiError('TRADE_WALLET_NOT_LINKED',403,'Use the linked primary wallet for this account.');
    return Response.json(await getTradeQuote(input));
  }catch(error){return jsonError(error,crypto.randomUUID());}
}
