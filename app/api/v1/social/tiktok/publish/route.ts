import {z} from 'zod';
import {one,db} from '@/lib/db';
import {mutation,ApiError,jsonError} from '@/lib/auth';
import {tiktokToken,tiktokUploadUrl,tiktokConfigured,tiktokDirectEnabled} from '@/lib/tiktok';
import {getMedia} from '@/lib/storage';
export const runtime='nodejs';
const schema=z.object({assetId:z.string().uuid(),privacyLevel:z.enum(['PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS','FOLLOWER_OF_CREATOR','SELF_ONLY']),caption:z.string().max(2200),allowComment:z.boolean(),allowDuet:z.boolean(),allowStitch:z.boolean(),commercial:z.enum(['none','own','paid']),aiGenerated:z.boolean(),consent:z.literal(true)});
export async function POST(request:Request){try{
 const user=await mutation(request);if(!tiktokConfigured())throw new ApiError('TIKTOK_NOT_CONFIGURED',503);if(!tiktokDirectEnabled())throw new ApiError('TIKTOK_DIRECT_NOT_ENABLED',503);
 const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new ApiError('INVALID_INPUT');const input=parsed.data;
 const asset=await one<any>("SELECT a.id,a.object_key,a.byte_size,j.start_seconds,j.end_seconds FROM media_assets a JOIN studio_jobs j ON j.output_asset_id=a.id WHERE a.id=$1 AND a.owner_id=$2 AND a.kind='clip' AND a.status='verified' AND a.mime='video/mp4'",[input.assetId,user.user_id]);
 if(!asset)throw new ApiError('STUDIO_MP4_REQUIRED',403);
 const existing=await one<any>("SELECT id,status,remote_ref,post_id FROM social_publications WHERE user_id=$1 AND asset_id=$2 AND provider='tiktok'",[user.user_id,asset.id]);if(existing)return Response.json(existing);
 const token=await tiktokToken(user.user_id,'video.publish');
 // Check the account's current options immediately before posting.
 const infoResponse=await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json; charset=UTF-8'},signal:AbortSignal.timeout(15000)});
 const info=await infoResponse.json();if(!infoResponse.ok||info.error?.code!=='ok')throw new ApiError('TIKTOK_CREATOR_INFO_UNAVAILABLE',502);
 const creator=info.data;if(!creator.privacy_level_options?.includes(input.privacyLevel)||Number(asset.end_seconds)-Number(asset.start_seconds)>Number(creator.max_video_post_duration_sec))throw new ApiError('TIKTOK_ACCOUNT_LIMIT',422);
 if((creator.comment_disabled&&input.allowComment)||(creator.duet_disabled&&input.allowDuet)||(creator.stitch_disabled&&input.allowStitch))throw new ApiError('TIKTOK_INTERACTION_DISABLED',422);
 const reserved=await one<any>("INSERT INTO social_publications(user_id,asset_id,provider,caption,details) VALUES($1,$2,'tiktok',$3,$4) ON CONFLICT(user_id,asset_id,provider) DO NOTHING RETURNING id",[user.user_id,asset.id,input.caption,JSON.stringify({privacyLevel:input.privacyLevel,commercial:input.commercial})]);
 if(!reserved)return Response.json(await one("SELECT id,status,remote_ref,post_id FROM social_publications WHERE user_id=$1 AND asset_id=$2 AND provider='tiktok'",[user.user_id,asset.id]));
 try{
  const bytes=(await getMedia(asset.object_key)).bytes;if(bytes.length!==Number(asset.byte_size)||!bytes.length||bytes.length>150_000_000)throw new ApiError('INVALID_MEDIA_SIZE',422);
  const chunkSize=bytes.length<=64_000_000?bytes.length:10_000_000,count=Math.max(1,Math.floor(bytes.length/chunkSize));
  const init=await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json; charset=UTF-8'},body:JSON.stringify({post_info:{title:input.caption,privacy_level:input.privacyLevel,disable_comment:!input.allowComment,disable_duet:!input.allowDuet,disable_stitch:!input.allowStitch,brand_content_toggle:input.commercial==='paid',brand_organic_toggle:input.commercial==='own',is_aigc:input.aiGenerated},source_info:{source:'FILE_UPLOAD',video_size:bytes.length,chunk_size:chunkSize,total_chunk_count:count}}),signal:AbortSignal.timeout(15000)});
  const result=await init.json();if(!init.ok||result.error?.code!=='ok'||!result.data?.publish_id||!result.data?.upload_url)throw new ApiError('TIKTOK_POST_INIT_FAILED',502);
  const uploadUrl=tiktokUploadUrl(result.data.upload_url);
  await db.query("UPDATE social_publications SET status='initialized',remote_ref=$2,updated_at=now() WHERE id=$1",[reserved.id,result.data.publish_id]);
  for(let i=0;i<count;i++){const start=i*chunkSize,end=i===count-1?bytes.length:start+chunkSize;
   const response=await fetch(uploadUrl,{method:'PUT',headers:{'content-type':'video/mp4','content-length':String(end-start),'content-range':'bytes '+start+'-'+(end-1)+'/'+bytes.length},body:bytes.subarray(start,end),signal:AbortSignal.timeout(120000)});
   if(response.status!==(i===count-1?201:206))throw new ApiError('TIKTOK_POST_UNCERTAIN_CHECK_STATUS',502);
  }
  await db.query("UPDATE social_publications SET status='uploaded',updated_at=now() WHERE id=$1",[reserved.id]);return Response.json({id:reserved.id,status:'uploaded'},{status:201});
 }catch(e){const row=await one<{remote_ref:string|null}>('SELECT remote_ref FROM social_publications WHERE id=$1',[reserved.id]);if(!row?.remote_ref)await db.query('DELETE FROM social_publications WHERE id=$1',[reserved.id]);else await db.query("UPDATE social_publications SET status='uncertain',updated_at=now() WHERE id=$1",[reserved.id]);throw e;}
 }catch(e){return jsonError(e,crypto.randomUUID());}}
