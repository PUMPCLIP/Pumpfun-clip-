import crypto from 'node:crypto';
import {z} from 'zod';
import {db,one} from '@/lib/db';
import {ApiError,mutation,requireUser,jsonError} from '@/lib/auth';
import {gate} from '@/lib/access';
import {parseClipUrl} from '@/lib/clip-attribution';
import {config} from '@/lib/config';
export const runtime='nodejs';

function shareUrl(id:string){return new URL(`/clip/${id}`,config.appUrl).toString();}
async function listBy(filter:{campaignId?:string;alertType?:string;alertId?:string},userId:string){
  let sql=`SELECT cl.id,cl.owner_id,cl.campaign_id,cl.stream_alert_event_id,cl.chain_alert_event_id,cl.url,cl.platform,cl.created_at,
      u.display_name AS clipper_name,c.title AS campaign_title,coalesce(c.streamer_id,s.owner_id) AS streamer_id,
      coalesce(su.display_name,ss.display_name) AS streamer_name
    FROM clip_links cl JOIN users u ON u.id=cl.owner_id
    LEFT JOIN campaigns c ON c.id=cl.campaign_id
    LEFT JOIN stream_alert_events e ON e.id=cl.stream_alert_event_id
    LEFT JOIN stream_sources ss ON ss.id=e.source_id
    LEFT JOIN users su ON su.id=coalesce(c.streamer_id,ss.owner_id)
    WHERE cl.active=true`;
  const values:unknown[]=[];
  if(filter.campaignId){values.push(filter.campaignId);sql+=` AND cl.campaign_id=$${values.length}`;}
  if(filter.alertType==='stream'){values.push(filter.alertId);sql+=` AND cl.stream_alert_event_id=$${values.length}`;}
  if(filter.alertType==='chain'){values.push(filter.alertId);sql+=` AND cl.chain_alert_event_id=$${values.length}`;}
  if(!filter.campaignId&&!filter.alertId){values.push(userId);sql+=` AND cl.owner_id=$${values.length}`;}
  sql+=' ORDER BY cl.created_at DESC LIMIT 100';
  return (await db.query(sql,values)).rows.map((row:any)=>({...row,share_url:shareUrl(row.id)}));
}

export async function GET(request:Request){try{
  const user=await requireUser(),query=new URL(request.url).searchParams;
  const campaignId=query.get('campaignId')||undefined,alertType=query.get('alertType')||undefined,alertId=query.get('alertId')||undefined;
  if(alertType&&!['stream','chain'].includes(alertType))throw new ApiError('INVALID_ALERT_TYPE',400);
  if(Boolean(alertType)!==Boolean(alertId))throw new ApiError('INVALID_ALERT_TARGET',400);
  if(campaignId){
    const campaign=await one<any>('SELECT id,streamer_id,state FROM campaigns WHERE id=$1',[campaignId]);
    if(!campaign)throw new ApiError('NOT_FOUND',404);
    if(campaign.state!=='live'&&campaign.streamer_id!==user.user_id&&!await one('SELECT id FROM campaign_memberships WHERE campaign_id=$1 AND clipper_id=$2',[campaignId,user.user_id]))throw new ApiError('CAMPAIGN_ACCESS_REQUIRED',403);
  }
  if(alertType==='chain'){
    const owned=await one('SELECT e.id FROM chain_alert_events e JOIN wallet_watch_targets t ON t.id=e.watch_target_id WHERE e.id=$1 AND t.user_id=$2',[alertId,user.user_id]);
    if(!owned)throw new ApiError('ALERT_ACCESS_REQUIRED',403);
  }
  if(alertType==='stream'){
    const exists=await one("SELECT id FROM stream_alert_events WHERE id=$1 AND status IN ('queued','processed')",[alertId]);
    if(!exists)throw new ApiError('NOT_FOUND',404);
  }
  return Response.json(await listBy({campaignId,alertType,alertId},user.user_id));
}catch(error){return jsonError(error,crypto.randomUUID());}}

export async function POST(request:Request){try{
  const user=await mutation(request);
  const parsed=z.object({url:z.string().trim().min(1).max(2048),campaignId:z.string().uuid().optional(),alertType:z.enum(['stream','chain']).optional(),alertId:z.string().uuid().optional()}).refine(value=>Boolean(value.campaignId||value.alertId),{message:'Choose a campaign or alert.'}).refine(value=>Boolean(value.alertType)===Boolean(value.alertId),{message:'Alert type and ID must be supplied together.'}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)throw new ApiError('INVALID_CLIP_LINK',422,parsed.error.message);
  const data=parsed.data;
  let clip:{url:string;platform:'tiktok'|'x'|'youtube_shorts'};
  try{clip=parseClipUrl(data.url);}catch(error){throw new ApiError('INVALID_CLIP_URL',422,error instanceof Error?error.message:'Enter a supported social clip URL.');}
  let streamerId:string|null=null;
  if(data.campaignId){
    const campaign=await one<any>('SELECT id,streamer_id,state FROM campaigns WHERE id=$1',[data.campaignId]);
    if(!campaign)throw new ApiError('NOT_FOUND',404);
    const membership=campaign.streamer_id===user.user_id?true:await one('SELECT id FROM campaign_memberships WHERE campaign_id=$1 AND clipper_id=$2',[data.campaignId,user.user_id]);
    if(!membership)throw new ApiError('CAMPAIGN_ACCESS_REQUIRED',403);
    await gate(user.user_id,campaign.streamer_id===user.user_id?'streamer':'clipper');
    streamerId=campaign.streamer_id;
  }else if(data.alertType==='stream'){
    const source=await one<any>("SELECT s.owner_id FROM stream_alert_events e JOIN stream_sources s ON s.id=e.source_id WHERE e.id=$1 AND e.status IN ('queued','processed')",[data.alertId]);
    if(!source?.owner_id)throw new ApiError('NOT_FOUND',404);
    await gate(user.user_id,source.owner_id===user.user_id?'streamer':'clipper');
  }else await gate(user.user_id,'clipper');
  let streamAlertId:string|null=null,chainAlertId:string|null=null;
  if(data.alertType==='stream'){
    const event=await one<any>(`SELECT e.id,e.payload,e.status,s.owner_id FROM stream_alert_events e JOIN stream_sources s ON s.id=e.source_id WHERE e.id=$1 AND e.status IN ('queued','processed')`,[data.alertId]);
    if(!event)throw new ApiError('NOT_FOUND',404);
    if(!event.owner_id)throw new ApiError('STREAMER_REQUIRED',422);
    if(data.campaignId&&streamerId!==event.owner_id)throw new ApiError('ATTRIBUTION_STREAMER_MISMATCH',422,'The campaign and live stream alert must have the same streamer.');
    streamAlertId=event.id;
  }
  if(data.alertType==='chain'){
    const event=await one('SELECT e.id FROM chain_alert_events e JOIN wallet_watch_targets t ON t.id=e.watch_target_id WHERE e.id=$1 AND t.user_id=$2',[data.alertId,user.user_id]);
    if(!event)throw new ApiError('ALERT_ACCESS_REQUIRED',403);
    chainAlertId=data.alertId!;
  }
  try{
    const row=await one<any>(`INSERT INTO clip_links(owner_id,campaign_id,stream_alert_event_id,chain_alert_event_id,url,platform)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id,owner_id,campaign_id,stream_alert_event_id,chain_alert_event_id,url,platform,created_at`,
      [user.user_id,data.campaignId||null,streamAlertId,chainAlertId,clip.url,clip.platform]);
    return Response.json({...row,share_url:shareUrl(row!.id),streamer_id:streamerId},{status:201});
  }catch(error:any){if(error?.code==='23505')throw new ApiError('CLIP_LINK_EXISTS',409,'That clip is already attached to this campaign or alert.');throw error;}
}catch(error){return jsonError(error,crypto.randomUUID());}}
