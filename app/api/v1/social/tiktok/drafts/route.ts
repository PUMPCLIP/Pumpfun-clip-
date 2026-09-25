import {z} from 'zod';
import {one,db} from '@/lib/db';
import {mutation,ApiError,jsonError} from '@/lib/auth';
import {getMedia} from '@/lib/storage';
import {tiktokToken,tiktokUploadUrl,tiktokConfigured} from '@/lib/tiktok';
import {rateLimit} from '@/lib/rate-limit';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  const user=await mutation(request);if(!tiktokConfigured())throw new ApiError('TIKTOK_NOT_CONFIGURED',503);
  const parsed=z.object({assetId:z.string().uuid()}).safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new ApiError('INVALID_INPUT');
  const asset=await one<any>("SELECT id,object_key,byte_size FROM media_assets WHERE id=$1 AND owner_id=$2 AND kind='clip' AND status='verified' AND mime='video/mp4'",[parsed.data.assetId,user.user_id]);
  if(!asset)throw new ApiError('MP4_ASSET_REQUIRED',403);
  await rateLimit(user.user_id,'tiktok-draft',10,86400);
  const reserved=await one<any>('INSERT INTO tiktok_drafts(user_id,asset_id) VALUES($1,$2) ON CONFLICT(user_id,asset_id) DO NOTHING RETURNING id,status',[user.user_id,asset.id]);
  if(!reserved){const existing=await one<any>('SELECT id,status,publish_id,fail_reason FROM tiktok_drafts WHERE user_id=$1 AND asset_id=$2',[user.user_id,asset.id]);return Response.json(existing,{status:200});}
  try{
   const token=await tiktokToken(user.user_id),bytes=(await getMedia(asset.object_key)).bytes;
   if(bytes.length!==Number(asset.byte_size)||!bytes.length||bytes.length>150_000_000)throw new ApiError('INVALID_MEDIA_SIZE',422);
   const chunkSize=bytes.length<=64_000_000?bytes.length:10_000_000;
   const count=Math.max(1,Math.floor(bytes.length/chunkSize));
   const init=await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json; charset=UTF-8'},body:JSON.stringify({source_info:{source:'FILE_UPLOAD',video_size:bytes.length,chunk_size:chunkSize,total_chunk_count:count}}),signal:AbortSignal.timeout(15000)});
   const info=await init.json();if(!init.ok||info.error?.code!=='ok'||!info.data?.publish_id||!info.data?.upload_url)throw new ApiError('TIKTOK_UPLOAD_INIT_FAILED',502);
   const uploadUrl=tiktokUploadUrl(info.data.upload_url);
   await db.query("UPDATE tiktok_drafts SET publish_id=$2,status='uploading',updated_at=now() WHERE id=$1",[reserved.id,info.data.publish_id]);
   for(let i=0;i<count;i++){
    const start=i*chunkSize,end=i===count-1?bytes.length:start+chunkSize;
    const part=await fetch(uploadUrl,{method:'PUT',headers:{'content-type':'video/mp4','content-length':String(end-start),'content-range':`bytes ${start}-${end-1}/${bytes.length}`},body:bytes.subarray(start,end),signal:AbortSignal.timeout(120000)});
    if(part.status!==(i===count-1?201:206))throw new ApiError('TIKTOK_TRANSFER_UNCERTAIN_CHECK_STATUS',502);
   }
   await db.query("UPDATE tiktok_drafts SET status='uploaded',updated_at=now() WHERE id=$1",[reserved.id]);
   return Response.json({id:reserved.id,status:'uploaded',instruction:'Open TikTok inbox to finish editing and publishing.'},{status:201});
  }catch(e){
   const existing=await one<{publish_id:string|null}>('SELECT publish_id FROM tiktok_drafts WHERE id=$1',[reserved.id]);
   if(!existing?.publish_id)await db.query('DELETE FROM tiktok_drafts WHERE id=$1',[reserved.id]);
   // A known publish_id must be inspected via status endpoint before any new upload.
   throw e;
  }
 }catch(e){return jsonError(e,crypto.randomUUID());}
}
