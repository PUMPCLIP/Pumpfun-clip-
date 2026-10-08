import {z} from 'zod';
import {one} from '@/lib/db';
import {mutation,jsonError,ApiError} from '@/lib/auth';
import {address,verifySolTransfer} from '@/lib/chain';
import {activateClipPlan} from '@/lib/clip-plan';
export const runtime='nodejs';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
  const user=await mutation(request),{id}=await params;
  if(!z.string().uuid().safeParse(id).success)throw new ApiError('INVALID_INTENT',400);
  const data=z.object({signature:z.string().min(60).max(120)}).parse(await request.json().catch(()=>null));
  const intent=await one<any>('SELECT * FROM clip_plan_intents WHERE id=$1 AND user_id=$2',[id,user.user_id]);
  if(!intent)throw new ApiError('NOT_FOUND',404);
  if(intent.state==='verified')return Response.json(intent);
  const wallet=await one<{address:string}>('SELECT address FROM wallets WHERE user_id=$1 ORDER BY is_primary DESC,updated_at DESC LIMIT 1',[user.user_id]);
  if(!wallet)throw new ApiError('WALLET_REQUIRED',403,'Connect your Solana wallet before verifying the deposit.');
  address(wallet.address);
  await verifySolTransfer(data.signature,wallet.address,intent.destination,BigInt(intent.amount_lamports));
  try{return Response.json(await activateClipPlan(user.user_id,intent,data.signature));}
  catch(error:any){if(error?.code==='23505')throw new ApiError('DUPLICATE_SIGNATURE',409);throw error;}
}catch(error){return jsonError(error,crypto.randomUUID());}}
