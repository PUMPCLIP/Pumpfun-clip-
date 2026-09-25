import {z} from 'zod';
import {one,db} from '@/lib/db';
import {mutation,ApiError,jsonError} from '@/lib/auth';
import {decrypt} from '@/lib/social';
import {getMedia} from '@/lib/storage';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  const user=await mutation(request);
  const input=z.object({assetId:z.string().uuid(),title:z.string().min(3).max(100),description:z.string().max(5000).default('')}).safeParse(await request.json().catch(()=>null));
  if(!input.success)throw new ApiError('INVALID_INPUT');
  const asset=await one<any>("SELECT * FROM media_assets WHERE id=$1 AND owner_id=$2 AND kind='clip' AND status='verified'",[input.data.assetId,user.user_id]);
  if(!asset)throw new ApiError('ASSET_REQUIRED',403);
  const posted=await one('SELECT id FROM social_posts WHERE user_id=$1 AND asset_id=$2 AND provider=$3',[user.user_id,asset.id,'youtube']);
  if(posted)throw new ApiError('ALREADY_PUBLISHED',409);
  const connection=await one<{refresh_token_cipher:string}>("SELECT refresh_token_cipher FROM social_connections WHERE user_id=$1 AND provider='youtube'",[user.user_id]);
  if(!connection)throw new ApiError('YOUTUBE_CONNECTION_REQUIRED',403);
  const token=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID!,client_secret:process.env.GOOGLE_CLIENT_SECRET!,refresh_token:decrypt(connection.refresh_token_cipher),grant_type:'refresh_token'})});
  if(!token.ok)throw new ApiError('YOUTUBE_RECONNECT_REQUIRED',409);
  const accessToken=(await token.json()).access_token;
  const bytes=(await getMedia(asset.object_key)).bytes;
  const start=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{authorization:'Bearer '+accessToken,'content-type':'application/json; charset=UTF-8','x-upload-content-type':'video/mp4','x-upload-content-length':String(bytes.length)},body:JSON.stringify({snippet:{title:input.data.title,description:input.data.description,categoryId:'22'},status:{privacyStatus:'private'}})});
  const location=start.headers.get('location');if(!start.ok||!location||!location.startsWith('https://www.googleapis.com/'))throw new ApiError('YOUTUBE_UPLOAD_INIT_FAILED',502);
  const response=await fetch(location,{method:'PUT',headers:{authorization:'Bearer '+accessToken,'content-type':'video/mp4','content-length':String(bytes.length)},body:bytes});
  if(!response.ok)throw new ApiError('YOUTUBE_UPLOAD_FAILED_CHECK_CHANNEL',502);
  const result=await response.json();if(!result.id)throw new ApiError('YOUTUBE_UPLOAD_INCOMPLETE',502);
  const url='https://www.youtube.com/watch?v='+encodeURIComponent(result.id);
  await db.query("INSERT INTO social_posts(user_id,asset_id,provider,remote_id,url) VALUES($1,$2,'youtube',$3,$4)",[user.user_id,asset.id,result.id,url]);
  return Response.json({url,privacy:'private'});
 }catch(e){return jsonError(e,crypto.randomUUID());}
}
