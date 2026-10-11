import crypto from 'node:crypto';
import {db} from '@/lib/db';
import {requireUser,jsonError} from '@/lib/auth';
export const runtime='nodejs';

const clipsFor=(foreignKey:string)=>`COALESCE((SELECT jsonb_agg(jsonb_build_object('id',cl.id,'url',cl.url,'platform',cl.platform,'clipper_name',u.display_name,'share_url','/clip/'||cl.id::text) ORDER BY cl.created_at DESC)
  FROM clip_links cl JOIN users u ON u.id=cl.owner_id WHERE cl.${foreignKey}=e.id AND cl.active),'[]'::jsonb)`;

export async function GET(){try{
  const user=await requireUser();
  const [chain,stream]=await Promise.all([
    db.query(`SELECT e.id,'chain' AS kind,e.provider,e.network,e.event_type,e.wallet_address,e.signature,e.mint,e.amount_raw,e.payload,e.observed_at AS created_at,e.status,
        ${clipsFor('chain_alert_event_id')} AS clip_links,NULL::text AS streamer_name
      FROM chain_alert_events e JOIN wallet_watch_targets t ON t.id=e.watch_target_id WHERE t.user_id=$1 ORDER BY e.observed_at DESC LIMIT 100`,[user.user_id]),
    db.query(`SELECT e.id,'stream' AS kind,e.provider,NULL::text AS network,e.event_type,NULL::text AS wallet_address,NULL::text AS signature,
        COALESCE(e.payload->>'mint',e.payload->>'token_mint',e.payload->>'tokenMint',e.payload->>'ca',e.payload->'data'->>'mint',e.payload->'data'->>'tokenMint') AS mint,
        NULL::text AS amount_raw,
        jsonb_build_object('symbol',COALESCE(e.payload->>'symbol',e.payload->>'token_symbol',e.payload->>'tokenSymbol'),
          'name',COALESCE(e.payload->>'name',e.payload->>'token_name',e.payload->>'tokenName')) AS payload,
        e.detected_at AS created_at,e.status,${clipsFor('stream_alert_event_id')} AS clip_links,s.display_name AS streamer_name
      FROM stream_alert_events e JOIN stream_sources s ON s.id=e.source_id WHERE e.status IN ('queued','processed') ORDER BY e.detected_at DESC LIMIT 100`)
  ]);
  const items=[...chain.rows,...stream.rows].sort((a:any,b:any)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).slice(0,100);
  return Response.json(items,{headers:{'cache-control':'private, max-age=10'}});
}catch(error){return jsonError(error,crypto.randomUUID());}}
