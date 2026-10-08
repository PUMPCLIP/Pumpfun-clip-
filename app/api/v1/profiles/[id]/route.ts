import crypto from 'node:crypto';
import {one,db} from '@/lib/db';
import {ApiError,jsonError,session} from '@/lib/auth';

export const runtime='nodejs';

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const profile=await one<any>(`SELECT u.id,u.display_name,u.public_handle,u.social_links,u.roles,
      COALESCE(r.accepted_count,0) accepted_count,COALESCE(r.total_views,0) total_views,COALESCE(r.reputation_score,0) reputation_score,
      (SELECT count(*)::int FROM profile_follows f WHERE f.followed_id=u.id) followers_count,
      (SELECT count(*)::int FROM profile_follows f WHERE f.follower_id=u.id) following_count,
      CASE WHEN u.avatar_key IS NOT NULL THEN '/api/v1/profiles/'||u.id||'/avatar?v='||COALESCE(to_char(u.avatar_updated_at,'YYYYMMDDHH24MISSMS'),'0')::text ELSE NULL END avatar_url
      FROM users u LEFT JOIN reputation_scores r ON r.user_id=u.id WHERE u.id=$1 AND u.deleted_at IS NULL`,[id]);
    if(!profile)throw new ApiError('NOT_FOUND',404);
    const viewer=await session();
    const following=viewer&&viewer.user_id!==id
      ? await one<{follows:boolean}>('SELECT EXISTS(SELECT 1 FROM profile_follows WHERE follower_id=$1 AND followed_id=$2) follows',[viewer.user_id,id])
      : null;
    const works=await db.query(`SELECT s.id,s.campaign_id,c.title AS campaign_title,c.target_platforms,ma.id AS asset_id,
      COALESCE(cm.view_count,0) view_count,COALESCE(cm.like_count,0) like_count,s.created_at
      FROM submissions s JOIN campaigns c ON c.id=s.campaign_id JOIN media_assets ma ON ma.id=s.asset_id
      LEFT JOIN clip_metrics cm ON cm.submission_id=s.id
      WHERE s.clipper_id=$1 AND s.state IN ('approved','published','rewarded')
      ORDER BY s.created_at DESC LIMIT 100`,[id]);
    const activities=await db.query(`SELECT * FROM (
      SELECT 'work'::text AS type,s.id::text AS id,c.title::text AS title,
        ('Published a clip for '||c.title)::text AS description,s.created_at,'/profile/'||s.clipper_id::text AS href
      FROM submissions s JOIN campaigns c ON c.id=s.campaign_id
      WHERE s.clipper_id=$1 AND s.state IN ('approved','published','rewarded')
      UNION ALL
      SELECT 'campaign'::text,c.id::text,c.title::text,('Launched the campaign '||c.title)::text,c.created_at,'/campaign/'||c.id::text
      FROM campaigns c WHERE c.streamer_id=$1 AND c.state IN ('live','ended','settling','closed')
      UNION ALL
      SELECT 'follow'::text,f.followed_id::text,u.display_name::text,('Started following @'||u.public_handle)::text,f.created_at,'/profile/'||u.id::text
      FROM profile_follows f JOIN users u ON u.id=f.followed_id
      WHERE f.follower_id=$1 AND u.deleted_at IS NULL AND u.public_handle IS NOT NULL
    ) activity ORDER BY created_at DESC LIMIT 40`,[id]);
    return Response.json({...profile,is_own_profile:viewer?.user_id===id,viewer_signed_in:Boolean(viewer),viewer_follows:Boolean(following?.follows),
      works:works.rows.map((x:any)=>({...x,video_url:'/api/v1/assets/'+x.asset_id})),activities:activities.rows});
  }catch(error){return jsonError(error,crypto.randomUUID());}
}
