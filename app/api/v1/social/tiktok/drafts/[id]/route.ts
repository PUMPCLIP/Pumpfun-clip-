import {one,db} from '@/lib/db';
import {requireUser,ApiError,jsonError} from '@/lib/auth';
import {tiktokToken} from '@/lib/tiktok';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 try{const user=await requireUser(),{id}=await params;
  const row=await one<any>('SELECT id,status,publish_id,fail_reason FROM tiktok_drafts WHERE id=$1 AND user_id=$2',[id,user.user_id]);if(!row)throw new ApiError('NOT_FOUND',404);
  if(!row.publish_id)return Response.json(row);
  const token=await tiktokToken(user.user_id);
  const result=await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json; charset=UTF-8'},body:JSON.stringify({publish_id:row.publish_id}),signal:AbortSignal.timeout(15000)});
  const data=await result.json();if(!result.ok||data.error?.code!=='ok')throw new ApiError('TIKTOK_STATUS_UNAVAILABLE',502);
  const status=data.data?.status;
  const next=status==='SEND_TO_USER_INBOX'?'inbox':status==='PUBLISH_COMPLETE'?'published':status==='FAILED'?'failed':row.status;
  const updated=await one<any>('UPDATE tiktok_drafts SET status=$2,fail_reason=$3,updated_at=now() WHERE id=$1 RETURNING id,status,publish_id,fail_reason',[id,next,status==='FAILED'?String(data.data.fail_reason).slice(0,200):null]);
  return Response.json(updated);
 }catch(e){return jsonError(e,crypto.randomUUID());}
}
