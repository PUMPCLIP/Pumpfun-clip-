import {z} from 'zod';
import {db,one} from '@/lib/db';
import {mutation,requireUser,jsonError,ApiError} from '@/lib/auth';
import {clipPlanPaymentConfig,clipPlanStatus} from '@/lib/clip-plan';
import {address} from '@/lib/chain';
export const runtime='nodejs';

export async function GET(){try{return Response.json(await clipPlanStatus((await requireUser()).user_id));}catch(error){return jsonError(error,crypto.randomUUID());}}

export async function POST(request:Request){try{
  const user=await mutation(request);
  const key=request.headers.get('idempotency-key');
  if(!key||key.length>128)throw new ApiError('IDEMPOTENCY_KEY_REQUIRED');
  const payment=clipPlanPaymentConfig();
  const wallet=await one<{address:string}>('SELECT address FROM wallets WHERE user_id=$1 ORDER BY is_primary DESC,updated_at DESC LIMIT 1',[user.user_id]);
  if(!wallet)throw new ApiError('WALLET_REQUIRED',403,'Connect your Solana wallet before starting the clip plan.');
  address(wallet.address);
  const row=await one<any>(`INSERT INTO clip_plan_intents(user_id,amount_lamports,destination,idempotency_key)
    VALUES($1,$2,$3,$4) ON CONFLICT(user_id,idempotency_key) DO UPDATE SET id=clip_plan_intents.id RETURNING *`,
    [user.user_id,payment.amountLamports,payment.destination,key]);
  if(row!.amount_lamports!==payment.amountLamports||row!.destination!==payment.destination)throw new ApiError('IDEMPOTENCY_CONFLICT',409);
  return Response.json({id:row!.id,state:row!.state,amountLamports:payment.amountLamports,amountSol:payment.amountSol,destination:payment.destination,network:payment.network,wallet:wallet.address},{status:201});
}catch(error){return jsonError(error,crypto.randomUUID());}}
