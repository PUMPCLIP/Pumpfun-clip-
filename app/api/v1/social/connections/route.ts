import {requireUser,jsonError} from '@/lib/auth';
import {db} from '@/lib/db';
export async function GET(){try{
 const user=await requireUser();
 const result=await db.query("SELECT c.provider,c.created_at,c.updated_at,m.display_name FROM social_connections c LEFT JOIN social_account_metadata m ON m.user_id=c.user_id AND m.provider=c.provider WHERE c.user_id=$1 ORDER BY c.provider",[user.user_id]);
 return Response.json(result.rows);
}catch(e){return jsonError(e,crypto.randomUUID());}}
