import {z} from 'zod';
import {audit,db,one} from '@/lib/db';
import {mutation,jsonError,ApiError} from '@/lib/auth';
import {address,verifySolTransfer} from '@/lib/chain';
import {activateClipPlan} from '@/lib/clip-plan';
export const runtime='nodejs';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){const requestId=crypto.randomUUID();try{
  const user=await mutation(request),{id}=await params;
  if(!z.string().uuid().safeParse(id).success)throw new ApiError('INVALID_INTENT',400);
  const data=z.object({signature:z.string().min(60).max(120)}).parse(await request.json().catch(()=>null));
  const intent=await one<any>('SELECT * FROM clip_plan_intents WHERE id=$1 AND user_id=$2',[id,user.user_id]);
  if(!intent)throw new ApiError('NOT_FOUND',404);
  if(intent.state==='verified')return Response.json(intent);
  await audit(db,user.user_id,'clip_plan.verification_attempt','clip_plan_intent',intent.id,{requestId});
  const wallet=await one<{address:string}>('SELECT address FROM wallets WHERE user_id=$1 ORDER BY is_primary DESC,updated_at DESC LIMIT 1',[user.user_id]);
  if(!wallet)throw new ApiError('WALLET_REQUIRED',403,'Connect your Solana wallet before verifying the deposit.');
  address(wallet.address);
  try {
    await verifySolTransfer(data.signature,wallet.address,intent.destination,BigInt(intent.amount_lamports));
  } catch(error:any) {
    const code=error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
    await audit(db,user.user_id,code==='CHAIN_VERIFICATION_PENDING'?'clip_plan.verification_pending':'clip_plan.verification_failed','clip_plan_intent',intent.id,{requestId,code});
    throw error;
  }
  try{return Response.json(await activateClipPlan(user.user_id,intent,data.signature));}
  catch(error:any){
    const code=error?.code==='23505'?'DUPLICATE_SIGNATURE':error instanceof ApiError?error.code:'INTERNAL_ERROR';
    await audit(db,user.user_id,'clip_plan.verification_failed','clip_plan_intent',intent.id,{requestId,code,stage:'activation'});
    if(error?.code==='23505')throw new ApiError('DUPLICATE_SIGNATURE',409);
    throw error;
  }
}catch(error){return jsonError(error,requestId);}}
