import {z} from 'zod';
import {one} from '@/lib/db';
import {mutation,ApiError,jsonError} from '@/lib/auth';
import {gate} from '@/lib/access';
import {reserveAiUnits} from '@/lib/ai-usage';
export const runtime='nodejs';
export async function POST(request:Request){
 try {
  const user=await mutation(request);await gate(user.user_id,'clipper');
  const idempotency=request.headers.get('idempotency-key');if(!idempotency) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED');
  if(!process.env.OPENAI_API_KEY) throw new ApiError('AI_NOT_CONFIGURED',503);
  const parsed=z.object({campaignId:z.string().uuid(),instructions:z.string().max(2000).default('')}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success) throw new ApiError('INVALID_INPUT');
  const campaign=await one<any>(`SELECT c.id,c.source_asset_id FROM campaigns c JOIN campaign_memberships m ON m.campaign_id=c.id WHERE c.id=$1 AND c.state='live' AND m.clipper_id=$2`,[parsed.data.campaignId,user.user_id]);
  if(!campaign?.source_asset_id) throw new ApiError('SOURCE_ACCESS_REQUIRED',403);
  const existing=await one<any>('SELECT id,status,created_at FROM ai_jobs WHERE campaign_id=$1 AND source_asset_id=$2',[campaign.id,campaign.source_asset_id]);
  if(existing)return Response.json(existing,{status:202});
  const ledger=await reserveAiUnits(user.user_id,'highlight_analysis',idempotency,{campaignId:campaign.id});
  const job=await one<any>(`INSERT INTO ai_jobs(campaign_id,source_asset_id,requested_by,instructions,usage_ledger_id) VALUES($1,$2,$3,$4,$5) RETURNING id,status,created_at`,[campaign.id,campaign.source_asset_id,user.user_id,parsed.data.instructions,ledger.id]);
  return Response.json(job,{status:202});
 }catch(e){return jsonError(e,crypto.randomUUID());}
}
