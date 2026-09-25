import {one} from '@/lib/db';
import {requireUser,ApiError,jsonError} from '@/lib/auth';
import {getOpenClipJob} from '@/lib/openclip';
import {settleAiUnits} from '@/lib/ai-usage';

export const runtime='nodejs';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{
  const user=await requireUser(),{id}=await params;
  const row=await one<any>('SELECT r.*,l.status AS usage_status FROM ai_clip_requests r LEFT JOIN ai_usage_ledger l ON l.id=r.usage_ledger_id WHERE r.id=$1 AND r.user_id=$2',[id,user.user_id]);
  if(!row)throw new ApiError('NOT_FOUND',404);
  if(row.provider_job_id&&['processing','queued'].includes(row.status)){
    try{
      const provider=await getOpenClipJob(row.provider_job_id),status=String(provider.status||provider.state||'processing').toLowerCase();
      const done=['succeeded','completed','success','ready'].includes(status),failed=['failed','error'].includes(status);
      if(done||failed){const next=await one<any>('UPDATE ai_clip_requests SET status=$2,output=$3,error_message=$4,updated_at=now() WHERE id=$1 RETURNING *',[id,done?'succeeded':'failed',JSON.stringify(provider),failed?String(provider.error||provider.message||'Provider failed'):null]);await settleAiUnits(row.usage_ledger_id,done?'consumed':'released');return Response.json(next);}
    }catch(e){/* Keep the job processing while a transient provider poll fails. */}
  }
  return Response.json(row);
}catch(e){return jsonError(e,crypto.randomUUID());}}
