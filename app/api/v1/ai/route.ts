import {z} from 'zod';
import {one} from '@/lib/db';
import {mutation,ApiError,jsonError} from '@/lib/auth';
import {gate} from '@/lib/access';
export const runtime='nodejs';
export async function POST(request:Request){
 try {
  const user=await mutation(request);await gate(user.user_id,'clipper');
  if(!process.env.OPENAI_API_KEY) throw new ApiError('AI_NOT_CONFIGURED',503);
  const parsed=z.object({campaignId:z.string().uuid()}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success) throw new ApiError('INVALID_INPUT');
  const campaign=await one<any>(`SELECT c.id,c.source_asset_id FROM campaigns c JOIN campaign_memberships m ON m.campaign_id=c.id WHERE c.id=$1 AND c.state='live' AND m.clipper_id=$2`,[parsed.data.campaignId,user.user_id]);
  if(!campaign?.source_asset_id) throw new ApiError('SOURCE_ACCESS_REQUIRED',403);
  const job=await one<any>(`INSERT INTO ai_jobs(campaign_id,source_asset_id,requested_by) VALUES($1,$2,$3) ON CONFLICT(campaign_id,source_asset_id) DO UPDATE SET id=ai_jobs.id RETURNING id,status,created_at`,[campaign.id,campaign.source_asset_id,user.user_id]);
  return Response.json(job,{status:202});
 }catch(e){return jsonError(e,crypto.randomUUID());}
}
