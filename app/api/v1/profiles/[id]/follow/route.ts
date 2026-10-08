import crypto from 'node:crypto';
import {db,one} from '@/lib/db';
import {ApiError,jsonError,mutation} from '@/lib/auth';
import {rateLimit} from '@/lib/rate-limit';

export const runtime='nodejs';

async function change(request:Request,params:Promise<{id:string}>,follow:boolean){
  const requestId=crypto.randomUUID();
  try{
    const user=await mutation(request),{id}=await params;
    await rateLimit(user.user_id,'profile-follow',120,3600);
    if(id===user.user_id)throw new ApiError('CANNOT_FOLLOW_SELF',422,'You cannot follow your own profile.');
    const target=await one<{id:string}>('SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL AND public_handle IS NOT NULL',[id]);
    if(!target)throw new ApiError('NOT_FOUND',404,'This public profile is not available.');
    if(follow){
      const inserted=await one<{follower_id:string}>('INSERT INTO profile_follows(follower_id,followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING follower_id',[user.user_id,id]);
      if(inserted)await db.query("INSERT INTO audit_events(actor_id,action,subject_type,subject_id,detail) VALUES($1,'profile.followed','user',$2,'{}'::jsonb)",[user.user_id,id]);
    }else{
      const deleted=await db.query('DELETE FROM profile_follows WHERE follower_id=$1 AND followed_id=$2 RETURNING follower_id',[user.user_id,id]);
      if(deleted.rowCount)await db.query("INSERT INTO audit_events(actor_id,action,subject_type,subject_id,detail) VALUES($1,'profile.unfollowed','user',$2,'{}'::jsonb)",[user.user_id,id]);
    }
    const counts=await one<{followers_count:string;following_count:string}>('SELECT (SELECT count(*) FROM profile_follows WHERE followed_id=$1)::text AS followers_count,(SELECT count(*) FROM profile_follows WHERE follower_id=$1)::text AS following_count',[id]);
    return Response.json({following:follow,followersCount:Number(counts?.followers_count||0),followingCount:Number(counts?.following_count||0)});
  }catch(error){return jsonError(error,requestId);}
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return change(request,params,true);}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){return change(request,params,false);}
