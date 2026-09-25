import {one,db} from '@/lib/db';
import {requireUser,mutation,ApiError,jsonError} from '@/lib/auth';
import {instagramPages,metaVersion} from '@/lib/instagram';
type Context={params:Promise<{id:string}>};
async function publication(user:string,id:string){const row=await one<any>("SELECT * FROM social_publications WHERE id=$1 AND user_id=$2 AND provider='instagram'",[id,user]);if(!row)throw new ApiError('NOT_FOUND',404);return row;}
export async function GET(_:Request,context:Context){try{
 const user=await requireUser(),row=await publication(user.user_id,(await context.params).id);
 if(!row.remote_ref)return Response.json({id:row.id,status:row.status});
 const page=(await instagramPages(user.user_id)).find(p=>p.pageId===row.details.pageId);if(!page)throw new ApiError('INSTAGRAM_PAGE_REQUIRED',403);
 const url=new URL('https://graph.facebook.com/'+metaVersion()+'/'+row.remote_ref);url.searchParams.set('fields','status_code,status');
 const r=await fetch(url,{headers:{authorization:'Bearer '+page.token},signal:AbortSignal.timeout(15000)}),data=await r.json();if(!r.ok)throw new ApiError('INSTAGRAM_STATUS_UNAVAILABLE',502);
 const next=row.status==='processing'?(data.status_code==='FINISHED'?'ready':['ERROR','EXPIRED'].includes(data.status_code)?'failed':'processing'):row.status;
 if(next!==row.status)await db.query('UPDATE social_publications SET status=$2,updated_at=now() WHERE id=$1',[row.id,next]);
 return Response.json({id:row.id,status:next,providerStatus:data.status_code,postId:row.post_id,error:data.status});
 }catch(e){return jsonError(e,crypto.randomUUID());}}
export async function POST(request:Request,context:Context){try{
 const user=await mutation(request),row=await publication(user.user_id,(await context.params).id);
 const input=await request.json().catch(()=>null);if(input?.consent!==true)throw new ApiError('PUBLISH_CONSENT_REQUIRED',422);
 if(row.status!=='ready')throw new ApiError('REEL_NOT_READY',409);
 const page=(await instagramPages(user.user_id)).find(p=>p.pageId===row.details.pageId);if(!page)throw new ApiError('INSTAGRAM_PAGE_REQUIRED',403);
 const changed=await one("UPDATE social_publications SET status='publishing',updated_at=now() WHERE id=$1 AND status='ready' RETURNING id",[row.id]);if(!changed)throw new ApiError('PUBLISH_ALREADY_STARTED',409);
 try{
  const url=new URL('https://graph.facebook.com/'+metaVersion()+'/'+page.igId+'/media_publish');
  const r=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+page.token,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({creation_id:row.remote_ref}),signal:AbortSignal.timeout(15000)});
  const result=await r.json();if(!r.ok||!result.id)throw new ApiError('INSTAGRAM_PUBLISH_UNCERTAIN',502);
  await db.query("UPDATE social_publications SET status='published',post_id=$2,updated_at=now() WHERE id=$1",[row.id,String(result.id)]);
  return Response.json({id:row.id,status:'published',postId:String(result.id)});
 }catch(e){await db.query("UPDATE social_publications SET status='uncertain',updated_at=now() WHERE id=$1",[row.id]);throw e;}
 }catch(e){return jsonError(e,crypto.randomUUID());}}
