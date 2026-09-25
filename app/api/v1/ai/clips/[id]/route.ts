import {one} from '@/lib/db';
import {requireUser,ApiError,jsonError} from '@/lib/auth';

export const runtime='nodejs';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){try{
  const user=await requireUser(),{id}=await params;
  const row=await one<any>(`SELECT id,status,instructions,aspect_ratio,start_seconds,end_seconds,output_asset_id,output,
    error_message,created_at,updated_at FROM ai_clip_requests WHERE id=$1 AND user_id=$2 AND engine='native'`,[id,user.user_id]);
  if(!row)throw new ApiError('NOT_FOUND',404);
  return Response.json(row);
}catch(error){return jsonError(error,crypto.randomUUID());}}
