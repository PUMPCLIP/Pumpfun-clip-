import crypto from 'node:crypto';
import {db} from '@/lib/db';
import {mutation,jsonError} from '@/lib/auth';
export const runtime='nodejs';
export async function GET(request:Request){
  try{
    const user=await mutation(request);
    const rows=await db.query(`SELECT id,'chain' AS kind,provider,network,event_type,wallet_address,signature,mint,amount_raw,payload,observed_at AS created_at,status
      FROM chain_alert_events e JOIN wallet_watch_targets t ON t.id=e.watch_target_id WHERE t.user_id=$1
      UNION ALL
      SELECT e.id,'stream' AS kind,e.provider,NULL,e.event_type,NULL,NULL,NULL,NULL,e.payload,e.detected_at,e.status
      FROM stream_alert_events e JOIN stream_sources s ON s.id=e.source_id WHERE s.owner_id=$1
      ORDER BY created_at DESC LIMIT 100`,[user.user_id]);
    return Response.json(rows.rows);
  }catch(error){return jsonError(error,crypto.randomUUID());}
}
