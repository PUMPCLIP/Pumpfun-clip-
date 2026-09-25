import {z} from 'zod';
import {db,one} from '@/lib/db';
import {mutation,ApiError,jsonError} from '@/lib/auth';
import {gate} from '@/lib/access';
import {rateLimit} from '@/lib/rate-limit';
import {reserveAiUnits,settleAiUnits} from '@/lib/ai-usage';

export const runtime='nodejs';
const uuid=z.string().uuid();
const allowedDomains=['youtube.com','youtu.be','tiktok.com','instagram.com','x.com','twitter.com'];
function safeSourceUrl(value:string){
  try{
    const url=new URL(value),host=url.hostname.toLowerCase().replace(/\.$/,'');
    return url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&
      !/^\d+(?:\.\d+){3}$/.test(host)&&!host.includes(':')&&
      allowedDomains.some(domain=>host===domain||host.endsWith('.'+domain));
  }catch{return false;}
}
function matchesExisting(row:any,input:any,sourceAssetId:string|null){
  return row.engine==='native'&&row.source_asset_id===sourceAssetId&&row.source_url===(input.sourceUrl||null)&&
    row.campaign_id===(input.campaignId||null)&&row.instructions===input.instructions&&row.aspect_ratio===input.aspectRatio&&
    (row.start_seconds===null)===(input.start===undefined)&&(row.end_seconds===null)===(input.end===undefined)&&
    (input.start===undefined||Number(row.start_seconds)===input.start)&&(input.end===undefined||Number(row.end_seconds)===input.end)&&
    row.caption===input.caption&&row.caption_style===input.captionStyle;
}
export async function POST(request:Request){try{
  const user=await mutation(request);await gate(user.user_id,'clipper');
  const key=request.headers.get('idempotency-key');if(!key||key.length>128)throw new ApiError('IDEMPOTENCY_KEY_REQUIRED');
  const parsed=z.object({
    sourceAssetId:uuid.optional(),sourceUrl:z.string().url().max(2048).optional(),campaignId:uuid.optional(),
    instructions:z.string().max(2000).default(''),aspectRatio:z.enum(['9:16','1:1','16:9']).default('9:16'),
    start:z.number().finite().min(0).transform(value=>Number(value.toFixed(3))).optional(),
    end:z.number().finite().positive().transform(value=>Number(value.toFixed(3))).optional(),
    caption:z.string().max(200).default(''),captionStyle:z.enum(['classic','bold','signal']).default('classic'),rightsConfirmed:z.boolean().default(false),
  }).refine(value=>Boolean(value.sourceAssetId||value.campaignId)!==Boolean(value.sourceUrl),'Provide either a source asset or a supported social video URL.').refine(
    value=>(value.start===undefined&&value.end===undefined)||(value.start!==undefined&&value.end!==undefined&&value.end>value.start&&value.end-value.start<=180),
    'Provide both start and end times for a clip no longer than 180 seconds.'
  ).refine(value=>!value.sourceUrl||value.rightsConfirmed,'Confirm that you own or have permission to use this video URL.').refine(
    value=>!value.sourceUrl||!value.campaignId,'Direct social URLs cannot be submitted to a campaign without its authorized source asset.'
  ).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)throw new ApiError('INVALID_INPUT',400,parsed.error.issues.map(issue=>issue.message).join('; '));
  const input=parsed.data;
  if(input.sourceUrl&&!safeSourceUrl(input.sourceUrl))throw new ApiError('UNSUPPORTED_SOURCE_URL',422,'Use an HTTPS video page from YouTube, TikTok, Instagram, or X.');
  if(input.campaignId&&input.sourceUrl)throw new ApiError('INVALID_INPUT',400,'Direct social URLs are processed outside campaign submissions.');

  let sourceAssetId:string|null=input.sourceAssetId||null;
  if(input.campaignId){
    const campaign=await one<any>(`SELECT c.source_asset_id FROM campaigns c JOIN campaign_memberships m ON m.campaign_id=c.id
      WHERE c.id=$1 AND c.state='live' AND m.clipper_id=$2`,[input.campaignId,user.user_id]);
    if(!campaign?.source_asset_id)throw new ApiError('SOURCE_ACCESS_REQUIRED',403);
    if(sourceAssetId&&sourceAssetId!==campaign.source_asset_id)throw new ApiError('SOURCE_ACCESS_REQUIRED',403,'The selected asset does not belong to this campaign.');
    sourceAssetId=campaign.source_asset_id;
  }
  if(sourceAssetId){
    const asset=await one<any>(`SELECT a.id FROM media_assets a WHERE a.id=$1 AND a.kind='source' AND a.status='verified'
      AND (a.owner_id=$2 OR EXISTS(SELECT 1 FROM campaigns c JOIN campaign_memberships m ON m.campaign_id=c.id
        WHERE c.source_asset_id=a.id AND m.clipper_id=$2 AND c.state='live'))`,[sourceAssetId,user.user_id]);
    if(!asset)throw new ApiError('SOURCE_ACCESS_REQUIRED',403);
  }
  const existing=await one<any>(`SELECT r.* FROM ai_clip_requests r JOIN ai_usage_ledger l ON l.id=r.usage_ledger_id
    WHERE r.user_id=$1 AND l.idempotency_key=$2`,[user.user_id,key]);
  if(existing){
    if(!matchesExisting(existing,input,sourceAssetId))throw new ApiError('IDEMPOTENCY_CONFLICT',409);
    return Response.json(existing,{status:200});
  }
  await rateLimit(user.user_id,'native-clip',20,3600);
  const ledger=await reserveAiUnits(user.user_id,'native_clip',key,{sourceAssetId,sourceUrl:input.sourceUrl||null,aspectRatio:input.aspectRatio});
  if(ledger.status!=='reserved')throw new ApiError('IDEMPOTENCY_KEY_ALREADY_SETTLED',409,'This idempotency key has already been settled; start a new job with a new key.');
  let row:any;
  try{row=await one<any>(`INSERT INTO ai_clip_requests(user_id,campaign_id,source_asset_id,source_url,instructions,aspect_ratio,
    start_seconds,end_seconds,caption,caption_style,usage_ledger_id,status,engine)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'queued','native')
    ON CONFLICT (usage_ledger_id) WHERE usage_ledger_id IS NOT NULL DO NOTHING RETURNING *`,
  [user.user_id,input.campaignId||null,sourceAssetId,input.sourceUrl||null,input.instructions,input.aspectRatio,
   input.start??null,input.end??null,input.caption,input.captionStyle,ledger.id]);}
  catch(error){await settleAiUnits(ledger.id,'released').catch(()=>{});throw error;}
  if(!row){
    const concurrent=await one<any>('SELECT * FROM ai_clip_requests WHERE usage_ledger_id=$1',[ledger.id]);
    if(!concurrent)throw new ApiError('JOB_CREATION_FAILED',500);
    if(!matchesExisting(concurrent,input,sourceAssetId))throw new ApiError('IDEMPOTENCY_CONFLICT',409);
    return Response.json(concurrent,{status:200});
  }
  await db.query("INSERT INTO audit_events(actor_id,action,subject_type,subject_id,detail) VALUES($1,'native_clip.queued','ai_clip_request',$2,$3)",
    [user.user_id,row.id,JSON.stringify({aspectRatio:input.aspectRatio,hasSourceUrl:Boolean(input.sourceUrl),rightsConfirmed:Boolean(input.sourceUrl&&input.rightsConfirmed)})]);
  return Response.json(row,{status:202});
}catch(error){return jsonError(error,crypto.randomUUID());}}
