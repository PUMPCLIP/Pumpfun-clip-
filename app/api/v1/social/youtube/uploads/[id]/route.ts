import {one,tx} from '@/lib/db';
import {requireUser,ApiError,jsonError} from '@/lib/auth';
import {decrypt} from '@/lib/social';
import {youtubeAccessToken,youtubeUploadUrl} from '@/lib/youtube';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const user=await requireUser(),{id}=await params;
  const row=await one<any>('SELECT * FROM youtube_uploads WHERE id=$1 AND user_id=$2',[id,user.user_id]);if(!row)throw new ApiError('NOT_FOUND',404);
  if(row.status==='private')return Response.json({id,status:'private',url:'https://www.youtube.com/watch?v='+encodeURIComponent(row.video_id)});
  if(!row.session_cipher)return Response.json({id,status:row.status});
  const token=await youtubeAccessToken(user.user_id),session=youtubeUploadUrl(decrypt(row.session_cipher));
  const response=await fetch(session,{method:'PUT',headers:{authorization:'Bearer '+token,'content-length':'0','content-range':`bytes */${row.byte_size}`},signal:AbortSignal.timeout(15000)});
  if(response.status===308)return Response.json({id,status:'uncertain',uploadedRange:response.headers.get('range'),message:'Upload incomplete. No new upload has been started.'});
  if(!response.ok)throw new ApiError('YOUTUBE_STATUS_UNAVAILABLE',502);
  const result=await response.json();if(!result.id)throw new ApiError('YOUTUBE_STATUS_UNAVAILABLE',502);
  const url='https://www.youtube.com/watch?v='+encodeURIComponent(result.id);
  await tx(async c=>{await c.query("UPDATE youtube_uploads SET status='private',video_id=$2,updated_at=now() WHERE id=$1",[id,result.id]);await c.query("INSERT INTO social_posts(user_id,asset_id,provider,remote_id,url) VALUES($1,$2,'youtube',$3,$4) ON CONFLICT(user_id,asset_id,provider) DO NOTHING",[user.user_id,row.asset_id,result.id,url]);});
  return Response.json({id,status:'private',url});
 }catch(e){return jsonError(e,crypto.randomUUID());}
}
