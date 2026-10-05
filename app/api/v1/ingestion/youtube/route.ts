import crypto from 'node:crypto';
import {z} from 'zod';
import {db,one} from '@/lib/db';
import {mutation,ApiError,jsonError} from '@/lib/auth';

export const runtime='nodejs';
const youtubeHost=/^(?:www\.|m\.)?(?:youtube\.com|youtu\.be)$/i;
function isChannelUrl(value:string){
  try{
    const url=new URL(value); const host=url.hostname.replace(/\.$/,'');
    if(url.protocol!=='https:'||!youtubeHost.test(host)||url.username||url.password||url.port)return false;
    return /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)(?:\/videos)?\/?$/i.test(url.pathname);
  }catch{return false;}
}
export async function POST(request:Request){try{
  const user=await mutation(request);
  if(!user.roles.includes('clipper')&&!user.roles.includes('streamer'))throw new ApiError('ROLE_REQUIRED',403,'Choose a creator or clipper role before ingesting a channel.');
  const parsed=z.object({channelUrl:z.string().url().max(2048),maxVideos:z.number().int().min(1).max(500).default(100)}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success||!isChannelUrl(parsed.data.channelUrl))throw new ApiError('INVALID_CHANNEL_URL',422,'Use an HTTPS YouTube channel URL such as youtube.com/@creator.');
  const channelUrl=new URL(parsed.data.channelUrl); channelUrl.search=''; channelUrl.hash='';
  const normalized=channelUrl.toString().replace(/\/$/,'');
  const existing=await one<any>(`SELECT i.*,count(v.id)::int AS video_count,count(v.id) FILTER(WHERE v.status='succeeded')::int AS completed_video_count
    FROM channel_ingestions i LEFT JOIN channel_ingestion_videos v ON v.ingestion_id=i.id
    WHERE i.user_id=$1 AND i.channel_url=$2 AND i.status IN ('queued','processing') GROUP BY i.id`,[user.user_id,normalized]);
  if(existing)return Response.json(existing,{status:202});
  const row=await one<any>(`INSERT INTO channel_ingestions(user_id,channel_url,max_videos,status) VALUES($1,$2,$3,'queued') RETURNING *`,[user.user_id,normalized,parsed.data.maxVideos]);
  await db.query("INSERT INTO audit_events(actor_id,action,subject_type,subject_id,detail) VALUES($1,'channel_ingestion.queued','channel_ingestion',$2,$3)",[user.user_id,row.id,JSON.stringify({channelUrl:normalized,maxVideos:parsed.data.maxVideos})]);
  return Response.json(row,{status:202});
}catch(error){return jsonError(error,crypto.randomUUID());}}

export async function GET(request:Request){try{
  const user=await mutation(request);
  const rows=await db.query(`SELECT i.*,count(v.id)::int AS video_count,count(v.id) FILTER(WHERE v.status='succeeded')::int AS completed_video_count,
    count(v.id) FILTER(WHERE v.status='failed')::int AS failed_video_count
    FROM channel_ingestions i LEFT JOIN channel_ingestion_videos v ON v.ingestion_id=i.id
    WHERE i.user_id=$1 GROUP BY i.id ORDER BY i.created_at DESC LIMIT 20`,[user.user_id]);
  return Response.json(rows.rows);
}catch(error){return jsonError(error,crypto.randomUUID());}}
