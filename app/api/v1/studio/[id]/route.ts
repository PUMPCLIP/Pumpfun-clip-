import {one} from '@/lib/db';
import {requireUser,ApiError,jsonError} from '@/lib/auth';
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const user=await requireUser(),{id}=await params;
    const job=await one<any>('SELECT id,status,error_message,output_asset_id,created_at,updated_at FROM studio_jobs WHERE id=$1 AND owner_id=$2',[id,user.user_id]);
    if(!job) throw new ApiError('NOT_FOUND',404);
    return Response.json(job);
  } catch(e) {return jsonError(e,crypto.randomUUID());}
}
