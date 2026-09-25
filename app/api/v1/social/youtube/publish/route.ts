import {z} from 'zod';
import {one,db,tx} from '@/lib/db';
import {mutation,ApiError,jsonError} from '@/lib/auth';
import {encrypt} from '@/lib/social';
import {youtubeAccessToken,youtubeUploadUrl} from '@/lib/youtube';
import {getMedia} from '@/lib/storage';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  const user=await mutation(request);
  const input=z.object({assetId:z.string().uuid(),title:z.string().min(3).max(100),description:z.string().max(5000).default('')}).safeParse(await request.json().catch(()=>null));
  if(!input.success)throw new ApiError('INVALID_INPUT');
  const asset=await one<any>("SELECT * FROM media_assets WHERE id=$1 AND owner_id=$2 AND kind='clip' AND status='verified' AND mime='video/mp4'",[input.data.assetId,user.user_id]);
  if(!asset)throw new ApiError('MP4_ASSET_REQUIRED',403);
  const reserved=await one<any>('INSERT INTO youtube_uploads(user_id,asset_id,byte_size) VALUES($1,$2,$3) ON CONFLICT(user_id,asset_id) DO NOTHING RETURNING id',[user.user_id,asset.id,asset.byte_size]);
  if(!reserved){const existing=await one<any>('SELECT id,status,video_id FROM youtube_uploads WHERE user_id=$1 AND asset_id=$2',[user.user_id,asset.id]);return Response.json({id:existing.id,status:existing.status,url:existing.video_id?'https://www.youtube.com/watch?v='+encodeURIComponent(existing.video_id):null});}
  try{
   const accessToken=await youtubeAccessToken(user.user_id);
   const bytes=(await getMedia(asset.object_key)).bytes;
   if(bytes.length!==Number(asset.byte_size)||!bytes.length)throw new ApiError('MEDIA_SIZE_MISMATCH',409);
   const start=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{authorization:'Bearer '+accessToken,'content-type':'application/json; charset=UTF-8','x-upload-content-type':'video/mp4','x-upload-content-length':String(bytes.length)},body:JSON.stringify({snippet:{title:input.data.title,description:input.data.description,categoryId:'22'},status:{privacyStatus:'private'}}),signal:AbortSignal.timeout(15000)});
   const location=start.headers.get('location');if(!start.ok||!location)throw new ApiError('YOUTUBE_UPLOAD_INIT_FAILED',502);
   const session=youtubeUploadUrl(location);
   await db.query("UPDATE youtube_uploads SET status='uploading',session_cipher=$2,updated_at=now() WHERE id=$1",[reserved.id,encrypt(session)]);
   const response=await fetch(session,{method:'PUT',headers:{authorization:'Bearer '+accessToken,'content-type':'video/mp4','content-length':String(bytes.length)},body:bytes,signal:AbortSignal.timeout(120000)});
   if(!response.ok)throw new ApiError('YOUTUBE_UPLOAD_UNCERTAIN_CHECK_STATUS',502);
   const result=await response.json();if(!result.id)throw new ApiError('YOUTUBE_UPLOAD_UNCERTAIN_CHECK_STATUS',502);
   await tx(async c=>{await c.query("UPDATE youtube_uploads SET status='private',video_id=$2,updated_at=now() WHERE id=$1",[reserved.id,result.id]);await c.query("INSERT INTO social_posts(user_id,asset_id,provider,remote_id,url) VALUES($1,$2,'youtube',$3,$4) ON CONFLICT(user_id,asset_id,provider) DO NOTHING",[user.user_id,asset.id,result.id,'https://www.youtube.com/watch?v='+encodeURIComponent(result.id)]);});
   return Response.json({id:reserved.id,status:'private',url:'https://www.youtube.com/watch?v='+encodeURIComponent(result.id)});
  }catch(e){const row=await one<{session_cipher:string|null}>('SELECT session_cipher FROM youtube_uploads WHERE id=$1',[reserved.id]);if(!row?.session_cipher)await db.query('DELETE FROM youtube_uploads WHERE id=$1',[reserved.id]);else await db.query("UPDATE youtube_uploads SET status='uncertain',updated_at=now() WHERE id=$1",[reserved.id]);throw e;}
 }catch(e){return jsonError(e,crypto.randomUUID());}
}
