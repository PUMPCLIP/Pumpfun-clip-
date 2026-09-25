import {z} from 'zod';
import {db,one,tx} from '@/lib/db';
import {mutation,ApiError,jsonError} from '@/lib/auth';
import {temporaryMediaUrl} from '@/lib/storage';
import {createOpenClip,openclipConfigured} from '@/lib/openclip';
import {reserveAiUnits,settleAiUnits} from '@/lib/ai-usage';

export const runtime='nodejs';
const uuid=z.string().uuid();
export async function POST(request:Request){try{
  const user=await mutation(request),key=request.headers.get('idempotency-key');if(!key)throw new ApiError('IDEMPOTENCY_KEY_REQUIRED');
  const input=z.object({sourceAssetId:uuid,campaignId:uuid.optional(),instructions:z.string().max(2000).default(''),aspectRatio:z.enum(['9:16','1:1','16:9']).default('9:16')}).parse(await request.json().catch(()=>null));
  if(!openclipConfigured())throw new ApiError('OPENCLIP_NOT_CONFIGURED',503);
  const asset=await one<any>(`SELECT a.* FROM media_assets a WHERE a.id=$1 AND a.kind='source' AND (a.owner_id=$2 OR EXISTS(SELECT 1 FROM campaigns c JOIN campaign_memberships m ON m.campaign_id=c.id WHERE c.source_asset_id=a.id AND m.clipper_id=$2 AND c.state='live'))`,[input.sourceAssetId,user.user_id]);
  if(!asset)throw new ApiError('SOURCE_ACCESS_REQUIRED',403);
  const existing=await one<any>('SELECT r.* FROM ai_clip_requests r JOIN ai_usage_ledger l ON l.id=r.usage_ledger_id WHERE r.user_id=$1 AND l.idempotency_key=$2',[user.user_id,key]).catch(()=>null);
  if(existing)return Response.json(existing,{status:200});
  const ledger=await reserveAiUnits(user.user_id,'openclip_clip',key,{sourceAssetId:input.sourceAssetId});
  const requestRow=await one<any>('INSERT INTO ai_clip_requests(user_id,campaign_id,source_asset_id,instructions,aspect_ratio,usage_ledger_id,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[user.user_id,input.campaignId||null,input.sourceAssetId,input.instructions,input.aspectRatio,ledger.id,'processing']);
  try{
    const provider=await createOpenClip({sourceUrl:await temporaryMediaUrl(asset.object_key),instructions:input.instructions,aspectRatio:input.aspectRatio});
    const providerJobId=String(provider.id||provider.project_id||provider.job_id||'');if(!providerJobId)throw new Error('Provider response did not include a project id');
    const updated=await one<any>('UPDATE ai_clip_requests SET provider_job_id=$2,updated_at=now() WHERE id=$1 RETURNING *',[requestRow.id,providerJobId]);
    return Response.json(updated,{status:202});
  }catch(e){await tx(async c=>{await c.query("UPDATE ai_clip_requests SET status='failed',error_message=$2,updated_at=now() WHERE id=$1",[requestRow.id,String(e).slice(0,500)]);});await settleAiUnits(ledger.id,'released');throw e;}
}catch(e){return jsonError(e,crypto.randomUUID());}}
