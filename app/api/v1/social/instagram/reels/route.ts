import {z} from 'zod';
import {one,db} from '@/lib/db';
import {mutation,ApiError,jsonError} from '@/lib/auth';
import {instagramConfigured,instagramPages,metaVersion} from '@/lib/instagram';
import {temporaryMediaUrl} from '@/lib/storage';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const user=await mutation(request);if(!instagramConfigured())throw new ApiError('INSTAGRAM_NOT_CONFIGURED',503);
 const parsed=z.object({assetId:z.string().uuid(),pageId:z.string().regex(/^[0-9]+$/),caption:z.string().max(2200),shareToFeed:z.boolean(),consent:z.literal(true)}).safeParse(await request.json().catch(()=>null));if(!parsed.success)throw new ApiError('INVALID_INPUT');
 const asset=await one<any>("SELECT id,object_key FROM media_assets WHERE id=$1 AND owner_id=$2 AND kind='clip' AND status='verified' AND mime='video/mp4'",[parsed.data.assetId,user.user_id]);if(!asset)throw new ApiError('MP4_ASSET_REQUIRED',403);
 const pages=await instagramPages(user.user_id),page=pages.find(p=>p.pageId===parsed.data.pageId);if(!page)throw new ApiError('INSTAGRAM_PAGE_REQUIRED',403);
 const reserved=await one<any>("INSERT INTO social_publications(user_id,asset_id,provider,caption,details) VALUES($1,$2,'instagram',$3,$4) ON CONFLICT(user_id,asset_id,provider) DO NOTHING RETURNING id",[user.user_id,asset.id,parsed.data.caption,JSON.stringify({pageId:page.pageId,igId:page.igId})]);
 if(!reserved)return Response.json(await one("SELECT id,status,remote_ref,post_id FROM social_publications WHERE user_id=$1 AND asset_id=$2 AND provider='instagram'",[user.user_id,asset.id]));
 try{
  const videoUrl=await temporaryMediaUrl(asset.object_key);
  const url=new URL('https://graph.facebook.com/'+metaVersion()+'/'+page.igId+'/media');
  const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+page.token,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({media_type:'REELS',video_url:videoUrl,caption:parsed.data.caption,share_to_feed:String(parsed.data.shareToFeed)}),signal:AbortSignal.timeout(15000)});
  const container=await response.json();if(!response.ok||!container.id)throw new ApiError('INSTAGRAM_CONTAINER_FAILED',502);
  await db.query("UPDATE social_publications SET remote_ref=$2,status='processing',updated_at=now() WHERE id=$1",[reserved.id,String(container.id)]);
  return Response.json({id:reserved.id,status:'processing'},{status:201});
 }catch(e){const row=await one<{remote_ref:string|null}>('SELECT remote_ref FROM social_publications WHERE id=$1',[reserved.id]);if(!row?.remote_ref)await db.query('DELETE FROM social_publications WHERE id=$1',[reserved.id]);throw e;}
 }catch(e){return jsonError(e,crypto.randomUUID());}}
