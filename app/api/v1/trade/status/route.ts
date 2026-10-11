import crypto from 'node:crypto';
import {requireUser,jsonError,ApiError} from '@/lib/auth';
import {one} from '@/lib/db';
import {reconcileTradeIntent} from '@/lib/clip-trade-settlement';
export const runtime='nodejs';

export async function GET(request:Request){try{
  const user=await requireUser(),signature=new URL(request.url).searchParams.get('signature')||'';
  if(!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signature))throw new ApiError('INVALID_SIGNATURE',422);
  const intent=await one<any>('SELECT * FROM trade_intents WHERE user_id=$1 AND signature=$2',[user.user_id,signature]);
  if(!intent)throw new ApiError('TRADE_INTENT_NOT_FOUND',404);
  return Response.json(await reconcileTradeIntent(intent));
}catch(error){return jsonError(error,crypto.randomUUID());}}
