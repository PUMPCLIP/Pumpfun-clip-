import {db} from '@/lib/db';
import {mutation,jsonError} from '@/lib/auth';

export const runtime='nodejs';
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await mutation(request),{id}=await params;await db.query('DELETE FROM payout_destinations WHERE id=$1 AND user_id=$2',[id,user.user_id]);const rows=(await db.query('SELECT id,provider,address,label,is_default FROM payout_destinations WHERE user_id=$1 ORDER BY is_default DESC,created_at DESC',[user.user_id])).rows;return Response.json(rows);}catch(e){return jsonError(e,crypto.randomUUID());}}
