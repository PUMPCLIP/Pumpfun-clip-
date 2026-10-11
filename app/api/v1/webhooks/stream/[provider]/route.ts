import crypto from 'node:crypto';
import {db,one} from '@/lib/db';
import {ApiError,jsonError} from '@/lib/auth';
import {matchedTerms,payloadId,readJson,verifyWebhookSecret,firstString,StreamProvider} from '@/lib/alert-pipeline';
export const runtime='nodejs';
const providers=new Set<StreamProvider>(['kick','twitch','youtube','custom']);
export async function POST(request:Request,{params}:{params:Promise<{provider:string}>}){
  const requestId=crypto.randomUUID();
  try{
    const {provider}=await params;
    if(!providers.has(provider as StreamProvider))throw new ApiError('UNSUPPORTED_STREAM_PROVIDER',404);
    verifyWebhookSecret(request,process.env.STREAM_WEBHOOK_SECRET||'');
    const payload=await readJson(request);
    const raw=JSON.stringify(payload),externalEventId=`${provider}:${payloadId(payload,raw)}`;
    const existing=await one<{id:string}>('SELECT id FROM stream_alert_events WHERE external_event_id=$1',[externalEventId]);
    if(existing)return Response.json({ok:true,duplicate:true,id:existing.id});
    const externalSourceId=firstString(payload?.channel_id,payload?.channelId,payload?.stream_id,payload?.streamId,payload?.broadcaster_user_id,payload?.data?.channel_id)||'unknown';
    const source=await one<{id:string}>(`INSERT INTO stream_sources(provider,external_id,display_name,metadata,last_event_at)
      VALUES($1,$2,$3,$4,now()) ON CONFLICT(provider,external_id) DO UPDATE SET metadata=EXCLUDED.metadata,last_event_at=now(),updated_at=now() RETURNING id`,
      [provider,externalSourceId,firstString(payload?.channel_name,payload?.channelName,payload?.broadcaster_user_name,payload?.data?.channel_name),JSON.stringify({webhook:true})]);
    const terms=matchedTerms(payload),status=terms.length?'queued':'ignored';
    const row=await one<{id:string}>(`INSERT INTO stream_alert_events(source_id,provider,external_event_id,event_type,matched_terms,payload,status)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[source?.id,provider,externalEventId,firstString(payload?.event_type,payload?.eventType,payload?.type)||'stream_event',terms,JSON.stringify(payload),status]);
    return Response.json({ok:true,id:row?.id,status,matchedTerms:terms},{status:202});
  }catch(error){return jsonError(error,requestId);}
}
