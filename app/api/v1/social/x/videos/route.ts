import {z} from 'zod';
import {one,db} from '@/lib/db';
import {mutation,ApiError,jsonError} from '@/lib/auth';
import {getMedia} from '@/lib/storage';
import {xAccessToken,xApi,xConfigured} from '@/lib/x-social';
import {rateLimit} from '@/lib/rate-limit';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const user=await mutation(request);if(!xConfigured())throw new ApiError('X_NOT_CONFIGURED',503);
 const parsed=z.object({assetId:z.string().uuid(),text:z.string().min(1).max(280),consent:z.literal(true)}).safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new ApiError('INVALID_INPUT');
 const asset=await one<any>("SELECT a.id,a.object_key,a.byte_size FROM media_assets a JOIN studio_jobs j ON j.output_asset_id=a.id WHERE a.id=$1 AND a.owner_id=$2 AND a.kind='clip' AND a.status='verified' AND a.mime='video/mp4'",[parsed.data.assetId,user.user_id]);
 if(!asset)throw new ApiError('STUDIO_MP4_REQUIRED',403);
 await rateLimit(user.user_id,'x-video',10,86400);
 const token=await xAccessToken(user.user_id);
 const reserved=await one<any>("INSERT INTO social_publications(user_id,asset_id,provider,caption) VALUES($1,$2,'x',$3) ON CONFLICT(user_id,asset_id,provider) DO NOTHING RETURNING id",[user.user_id,asset.id,parsed.data.text]);
 if(!reserved)return Response.json(await one("SELECT id,status,remote_ref,post_id FROM social_publications WHERE user_id=$1 AND asset_id=$2 AND provider='x'",[user.user_id,asset.id]));
 try{
  const bytes=(await getMedia(asset.object_key)).bytes;if(!bytes.length||bytes.length!==Number(asset.byte_size)||bytes.length>150_000_000)throw new ApiError('INVALID_MEDIA_SIZE',422);
  const initialized=await xApi('https://api.x.com/2/media/upload/initialize',token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({media_type:'video/mp4',total_bytes:bytes.length,media_category:'tweet_video'})});
  const mediaId=String(initialized.data?.id||'');if(!/^[0-9]+$/.test(mediaId))throw new ApiError('X_MEDIA_INIT_FAILED',502);
  await db.query("UPDATE social_publications SET status='initialized',remote_ref=$2,updated_at=now() WHERE id=$1",[reserved.id,mediaId]);
  const chunk=4*1024*1024;
  for(let start=0,index=0;start<bytes.length;start+=chunk,index++){
   const form=new FormData();form.set('segment_index',String(index));form.set('media',new Blob([new Uint8Array(bytes.subarray(start,Math.min(start+chunk,bytes.length)))],{type:'video/mp4'}),'clip.mp4');
   await xApi('https://api.x.com/2/media/upload/'+mediaId+'/append',token,{method:'POST',body:form});
  }
  const finalized=await xApi('https://api.x.com/2/media/upload/'+mediaId+'/finalize',token,{method:'POST'});
  const state=finalized.data?.processing_info?.state;
  if(state==='failed')throw new ApiError('X_MEDIA_PROCESSING_FAILED',502);
  const status=state==='pending'||state==='in_progress'?'processing':'ready';
  await db.query('UPDATE social_publications SET status=$2,updated_at=now() WHERE id=$1',[reserved.id,status]);
  return Response.json({id:reserved.id,status},{status:201});
 }catch(e){const row=await one<{remote_ref:string|null}>('SELECT remote_ref FROM social_publications WHERE id=$1',[reserved.id]);if(!row?.remote_ref)await db.query('DELETE FROM social_publications WHERE id=$1',[reserved.id]);else await db.query("UPDATE social_publications SET status='uncertain',updated_at=now() WHERE id=$1",[reserved.id]);throw e;}
 }catch(e){return jsonError(e,crypto.randomUUID());}}
