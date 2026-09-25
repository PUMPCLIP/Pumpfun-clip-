import {one,db} from '@/lib/db';
import {requireUser,mutation,ApiError,jsonError} from '@/lib/auth';
import {xAccessToken,xApi} from '@/lib/x-social';
type Context={params:Promise<{id:string}>};
async function publication(user:string,id:string){const row=await one<any>("SELECT * FROM social_publications WHERE id=$1 AND user_id=$2 AND provider='x'",[id,user]);if(!row)throw new ApiError('NOT_FOUND',404);return row;}
export async function GET(_:Request,context:Context){try{
 const user=await requireUser(),row=await publication(user.user_id,(await context.params).id);
 if(row.status!=='processing'||!row.remote_ref)return Response.json({id:row.id,status:row.status,postId:row.post_id,url:row.post_id?'https://x.com/i/web/status/'+row.post_id:undefined});
 const token=await xAccessToken(user.user_id),url=new URL('https://api.x.com/2/media/upload');url.searchParams.set('media_id',row.remote_ref);url.searchParams.set('command','STATUS');
 const data=await xApi(url.toString(),token),state=data.data?.processing_info?.state;
 const status=state==='failed'?'failed':state==='pending'||state==='in_progress'?'processing':'ready';
 if(status!==row.status)await db.query('UPDATE social_publications SET status=$2,updated_at=now() WHERE id=$1',[row.id,status]);
 return Response.json({id:row.id,status,providerStatus:state});
 }catch(e){return jsonError(e,crypto.randomUUID());}}
export async function POST(request:Request,context:Context){try{
 const user=await mutation(request),row=await publication(user.user_id,(await context.params).id);
 const input=await request.json().catch(()=>null);if(input?.consent!==true)throw new ApiError('PUBLISH_CONSENT_REQUIRED',422);
 if(row.status!=='ready')throw new ApiError('VIDEO_NOT_READY',409);
 const token=await xAccessToken(user.user_id);
 const changed=await one("UPDATE social_publications SET status='publishing',updated_at=now() WHERE id=$1 AND status='ready' RETURNING id",[row.id]);if(!changed)throw new ApiError('PUBLISH_ALREADY_STARTED',409);
 try{
  const result=await xApi('https://api.x.com/2/tweets',token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:row.caption,media:{media_ids:[row.remote_ref]}})});
  const postId=String(result.data?.id||'');if(!/^[0-9]+$/.test(postId))throw new ApiError('X_POST_UNCERTAIN',502);
  await db.query("UPDATE social_publications SET status='published',post_id=$2,updated_at=now() WHERE id=$1",[row.id,postId]);
  return Response.json({id:row.id,status:'published',postId,url:'https://x.com/i/web/status/'+postId});
 }catch(e){await db.query("UPDATE social_publications SET status='uncertain',updated_at=now() WHERE id=$1",[row.id]);throw e;}
 }catch(e){return jsonError(e,crypto.randomUUID());}}
