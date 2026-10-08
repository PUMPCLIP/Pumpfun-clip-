import crypto from 'node:crypto';
import {db,one} from '@/lib/db';
import {ApiError,jsonError} from '@/lib/auth';

export const runtime='nodejs';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const direction=new URL(request.url).searchParams.get('type');
    if(direction!=='followers'&&direction!=='following')throw new ApiError('INVALID_CONNECTION_TYPE',422,'Choose followers or following.');
    const profile=await one<{id:string}>('SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL AND public_handle IS NOT NULL',[id]);
    if(!profile)throw new ApiError('NOT_FOUND',404);
    const query=direction==='followers'
      ? `SELECT u.id,u.display_name,u.public_handle,u.roles,CASE WHEN u.avatar_key IS NOT NULL THEN '/api/v1/profiles/'||u.id||'/avatar?v='||COALESCE(to_char(u.avatar_updated_at,'YYYYMMDDHH24MISSMS'),'0')::text ELSE NULL END AS avatar_url,f.created_at
         FROM profile_follows f JOIN users u ON u.id=f.follower_id
         WHERE f.followed_id=$1 AND u.deleted_at IS NULL AND u.public_handle IS NOT NULL ORDER BY f.created_at DESC LIMIT 100`
      : `SELECT u.id,u.display_name,u.public_handle,u.roles,CASE WHEN u.avatar_key IS NOT NULL THEN '/api/v1/profiles/'||u.id||'/avatar?v='||COALESCE(to_char(u.avatar_updated_at,'YYYYMMDDHH24MISSMS'),'0')::text ELSE NULL END AS avatar_url,f.created_at
         FROM profile_follows f JOIN users u ON u.id=f.followed_id
         WHERE f.follower_id=$1 AND u.deleted_at IS NULL AND u.public_handle IS NOT NULL ORDER BY f.created_at DESC LIMIT 100`;
    const rows=await db.query(query,[id]);
    return Response.json({items:rows.rows});
  }catch(error){return jsonError(error,crypto.randomUUID());}
}
