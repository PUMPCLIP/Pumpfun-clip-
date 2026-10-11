import crypto from 'node:crypto';
import {z} from 'zod';
import {db,one} from '@/lib/db';
import {ApiError,mutation,jsonError} from '@/lib/auth';
import {config} from '@/lib/config';
import {mintFromAlertPayload} from '@/lib/clip-trade-attribution';
export const runtime='nodejs';

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{
  const {id}=await params;if(!z.string().uuid().safeParse(id).success)throw new ApiError('INVALID_CLIP_LINK',400);
  const row=await one<any>(`SELECT cl.id,cl.owner_id,cl.campaign_id,cl.stream_alert_event_id,cl.chain_alert_event_id,cl.url,cl.platform,cl.active,
      clip.display_name AS clipper_name,c.title AS campaign_title,c.state AS campaign_state,c.streamer_id AS campaign_streamer_id,
      e.status AS alert_status,e.payload,s.owner_id AS alert_streamer_id,s.display_name AS stream_name,
      streamer.display_name AS streamer_name
    FROM clip_links cl JOIN users clip ON clip.id=cl.owner_id
    LEFT JOIN campaigns c ON c.id=cl.campaign_id
    LEFT JOIN stream_alert_events e ON e.id=cl.stream_alert_event_id
    LEFT JOIN stream_sources s ON s.id=e.source_id
    LEFT JOIN users streamer ON streamer.id=coalesce(c.streamer_id,s.owner_id)
    WHERE cl.id=$1 AND cl.active=true`,[id]);
  if(!row)throw new ApiError('NOT_FOUND',404);
  if(row.campaign_id&&row.campaign_state!=='live')throw new ApiError('NOT_FOUND',404);
  if(row.stream_alert_event_id&&!['queued','processed'].includes(row.alert_status))throw new ApiError('NOT_FOUND',404);
  if(row.chain_alert_event_id&&!row.campaign_id)throw new ApiError('NOT_FOUND',404);
  const mint=row.stream_alert_event_id?mintFromAlertPayload(row.payload):null;
  const streamerId=row.campaign_streamer_id||row.alert_streamer_id||null;
  const tradeEligible=Boolean(row.stream_alert_event_id&&mint&&streamerId&&(!row.campaign_id||row.campaign_streamer_id===row.alert_streamer_id));
  return Response.json({id:row.id,url:row.url,platform:row.platform,clipperName:row.clipper_name,campaignId:row.campaign_id,campaignTitle:row.campaign_title,streamerName:row.streamer_name||row.stream_name||'Live creator',mint:tradeEligible?mint:null,tradeEligible,feeBps:tradeEligible?100:0,shareUrl:new URL(`/clip/${row.id}`,config.appUrl).toString()},{headers:{'cache-control':'public, max-age=30, stale-while-revalidate=60'}});
}catch(error){return jsonError(error,crypto.randomUUID());}}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{
  const user=await mutation(request),{id}=await params;
  const row=await one<any>('UPDATE clip_links SET active=false,updated_at=now() WHERE id=$1 AND owner_id=$2 AND active=true RETURNING id',[id,user.user_id]);
  if(!row)throw new ApiError('NOT_FOUND',404);
  return Response.json({ok:true,active:false});
}catch(error){return jsonError(error,crypto.randomUUID());}}
