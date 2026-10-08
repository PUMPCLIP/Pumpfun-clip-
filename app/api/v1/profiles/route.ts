import {db} from '@/lib/db';
import {ApiError,jsonError} from '@/lib/auth';

export const runtime='nodejs';

export async function GET(request:Request){
  try{
    const params=new URL(request.url).searchParams;
    const requested=Number(params.get('limit')||24);
    const limit=Math.min(Math.max(Number.isFinite(requested)?requested:24,1),60);
    const role=params.get('role');
    const roles=role==='streamer'?['streamer']:role==='clipper'?['clipper']:['streamer','clipper'];
    const rows=await db.query(`
      SELECT u.id,u.display_name,u.public_handle,u.social_links,u.roles,
        COALESCE(r.accepted_count,0) AS accepted_count,
        COALESCE(r.total_views,0) AS total_views,
        COALESCE(r.reputation_score,0) AS reputation_score,
        COALESCE((SELECT SUM(ra.lamports) FROM reward_awards ra WHERE ra.clipper_id=u.id AND ra.state IN ('ready','broadcast','paid')),0) AS earned_lamports,
        COALESCE((SELECT COUNT(*) FROM campaigns c2 WHERE c2.streamer_id=u.id AND c2.state NOT IN ('draft','closed')),0) AS campaign_count,
        work.asset_id,work.campaign_title,work.video_url
      FROM users u
      LEFT JOIN reputation_scores r ON r.user_id=u.id
      LEFT JOIN LATERAL (
        SELECT ma.id AS asset_id,c.title AS campaign_title,'/api/v1/assets/'||ma.id AS video_url
        FROM submissions s
        JOIN campaigns c ON c.id=s.campaign_id
        JOIN media_assets ma ON ma.id=s.asset_id
        WHERE s.clipper_id=u.id AND s.state IN ('approved','published','rewarded') AND ma.status='verified'
        ORDER BY s.created_at DESC LIMIT 1
      ) work ON true
      WHERE u.roles && $1::text[]
      ORDER BY COALESCE(r.total_views,0) DESC,u.display_name ASC
      LIMIT $2`,[roles,limit]);
    return Response.json({items:rows.rows});
  }catch(error){return jsonError(error instanceof ApiError?error:new ApiError('NETWORK_UNAVAILABLE',503,'Creator network is temporarily unavailable.'),crypto.randomUUID());}
}
