import {one} from '@/lib/db';
import {requireUser,jsonError,ApiError} from '@/lib/auth';
import {tiktokToken} from '@/lib/tiktok';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{
 const user=await requireUser(),{id}=await params;
 const row=await one<any>("SELECT id,status,remote_ref,post_id FROM social_publications WHERE id=$1 AND user_id=$2 AND provider='tiktok'",[id,user.user_id]);if(!row)throw new ApiError('NOT_FOUND',404);
 if(!row.remote_ref)return Response.json(row);
 const token=await tiktokToken(user.user_id,'video.publish');const r=await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json; charset=UTF-8'},body:JSON.stringify({publish_id:row.remote_ref}),signal:AbortSignal.timeout(15000)});
 const result=await r.json();if(!r.ok||result.error?.code!=='ok')throw new ApiError('TIKTOK_STATUS_UNAVAILABLE',502);
 const state=result.data?.status,status=state==='PUBLISH_COMPLETE'?'published':state==='FAILED'?'failed':'processing';
 const postId=result.data?.publicaly_available_post_id?.[0]?String(result.data.publicaly_available_post_id[0]):null;
 const updated=await one<any>("UPDATE social_publications SET status=$2,post_id=COALESCE($3,post_id),error_message=$4,updated_at=now() WHERE id=$1 RETURNING id,status,remote_ref,post_id,error_message",[id,status,postId,state==='FAILED'?String(result.data.fail_reason).slice(0,200):null]);return Response.json(updated);
 }catch(e){return jsonError(e,crypto.randomUUID());}}
