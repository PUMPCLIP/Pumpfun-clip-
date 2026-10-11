import crypto from 'node:crypto';
import {z} from 'zod';
import {db,one} from '@/lib/db';
import {ApiError,jsonError,mutation,requireUser} from '@/lib/auth';
import {rateLimit} from '@/lib/rate-limit';

export const runtime='nodejs';

const eventSchema=z.object({
  clipId:z.string().uuid(),
  eventId:z.string().uuid(),
  eventType:z.enum(['preview_started','preview_paused','preview_completed','download_clicked']),
  positionSeconds:z.number().min(0).max(86400).optional(),
  sessionId:z.string().uuid().optional(),
});

export async function GET(){
  const requestId=crypto.randomUUID();
  try{
    const user=await requireUser();
    const [stats,recent]=await Promise.all([
      one<any>(`SELECT count(*)::int AS total_events,
        count(DISTINCT clip_id)::int AS clips_tracked,
        count(*) FILTER (WHERE event_type='preview_started')::int AS previews_started,
        count(*) FILTER (WHERE event_type='preview_completed')::int AS previews_completed,
        count(*) FILTER (WHERE event_type='preview_paused')::int AS previews_paused,
        count(*) FILTER (WHERE event_type='download_clicked')::int AS downloads_clicked,
        count(DISTINCT created_at::date)::int AS active_days,
        max(created_at) AS last_interaction_at
        FROM clip_interaction_events WHERE user_id=$1`,[user.user_id]),
      db.query(`SELECT e.clip_id,
        r.aspect_ratio,
        r.status,
        count(*)::int AS total_events,
        count(*) FILTER (WHERE e.event_type='preview_started')::int AS previews_started,
        count(*) FILTER (WHERE e.event_type='preview_completed')::int AS previews_completed,
        count(*) FILTER (WHERE e.event_type='download_clicked')::int AS downloads_clicked,
        max(e.created_at) AS last_interaction_at
        FROM clip_interaction_events e
        JOIN ai_clip_requests r ON r.id=e.clip_id
        WHERE e.user_id=$1
        GROUP BY e.clip_id,r.aspect_ratio,r.status
        ORDER BY max(e.created_at) DESC
        LIMIT 12`,[user.user_id]),
    ]);
    return Response.json({stats:stats||{total_events:0,clips_tracked:0,previews_started:0,previews_completed:0,previews_paused:0,downloads_clicked:0,active_days:0,last_interaction_at:null},recent:recent.rows},{headers:{'cache-control':'no-store'}});
  }catch(error){return jsonError(error,requestId);}
}

export async function POST(request:Request){
  const requestId=crypto.randomUUID();
  try{
    const user=await mutation(request);
    await rateLimit(user.user_id,'clip-interaction-event',240,3600);
    const data=eventSchema.parse(await request.json().catch(()=>null));
    const clip=await one<{id:string}>(`SELECT id FROM ai_clip_requests WHERE id=$1 AND user_id=$2 AND output_asset_id IS NOT NULL`,[data.clipId,user.user_id]);
    if(!clip)throw new ApiError('CLIP_NOT_FOUND',404,'This rendered clip is not available in your workspace.');
    const inserted=await one<{id:string}>(`INSERT INTO clip_interaction_events(user_id,clip_id,event_id,event_type,position_seconds,session_id)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,event_id) DO NOTHING RETURNING id`,[user.user_id,data.clipId,data.eventId,data.eventType,data.positionSeconds??null,data.sessionId??null]);
    return Response.json({counted:Boolean(inserted)},{status:inserted?201:200});
  }catch(error){return jsonError(error,requestId);}
}
