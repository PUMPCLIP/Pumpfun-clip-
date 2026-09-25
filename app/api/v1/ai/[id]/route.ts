import {one} from '@/lib/db';
import {requireUser,ApiError,jsonError} from '@/lib/auth';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 try{const user=await requireUser(),{id}=await params;
  const job=await one<any>(`SELECT j.id,j.status,j.transcript,j.suggestions,j.error_message FROM ai_jobs j JOIN campaign_memberships m ON m.campaign_id=j.campaign_id AND m.clipper_id=$2 WHERE j.id=$1`,[id,user.user_id]);
  if(!job) throw new ApiError('NOT_FOUND',404);return Response.json(job);
 }catch(e){return jsonError(e,crypto.randomUUID());}
}
