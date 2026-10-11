import crypto from 'node:crypto';
import {db,one} from '@/lib/db';
import {ApiError,jsonError} from '@/lib/auth';
import {payloadId,readJson,verifyWebhookSecret,firstString,ChainProvider} from '@/lib/alert-pipeline';
export const runtime='nodejs';
function transfers(payload:any){
  const found:any[]=[];
  for(const item of Array.isArray(payload)?payload:[payload]){
    for(const transfer of [...(item?.tokenTransfers||[]),...(item?.nativeTransfers||[])]) found.push({
      from:firstString(transfer.fromUserAccount,transfer.from,transfer.source),to:firstString(transfer.toUserAccount,transfer.to,transfer.destination),
      mint:firstString(transfer.mint),amount:firstString(transfer.tokenAmount,transfer.amount,transfer.lamports)
    });
    if(!found.length){const signature=firstString(item?.signature,item?.transaction?.signature,item?.result?.signature); if(signature)found.push({from:'',to:'',mint:'',amount:''});}
  }
  return found;
}
export async function POST(request:Request){
  const requestId=crypto.randomUUID();
  try{
    const provider=(process.env.SOLANA_INDEXER_PROVIDER||'custom') as ChainProvider;
    if(!['helius','quicknode','custom'].includes(provider))throw new ApiError('INVALID_INDEXER_PROVIDER',500);
    verifyWebhookSecret(request,process.env.SOLANA_INDEXER_WEBHOOK_SECRET||'','x-solana-webhook-secret');
    const payload=await readJson(request),network=firstString(payload?.network,process.env.SOLANA_INDEXER_NETWORK)||'mainnet-beta';
    if(network!=='mainnet-beta'&&network!=='mainnet')throw new ApiError('MAINNET_REQUIRED',422,'The production indexer endpoint accepts mainnet events only.');
    const targets=await db.query<{id:string;address:string}>('SELECT id,address FROM wallet_watch_targets WHERE network IN ($1,$2) AND enabled=true',['mainnet-beta','mainnet']);
    const byAddress=new Map(targets.rows.map(row=>[row.address,row]));
    const events=Array.isArray(payload)?payload:(Array.isArray(payload?.events)?payload.events:[payload]); let inserted=0;
    for(const event of events){
      const eventRaw=JSON.stringify(event),signature=firstString(event?.signature,event?.transaction?.signature,event?.result?.signature),baseId=payloadId(event,eventRaw);
      for(const transfer of transfers(event)){
        const target=byAddress.get(transfer.from)||byAddress.get(transfer.to); if(!target)continue;
        const externalEventId=`${provider}:${baseId}:${target.address}:${transfer.mint||'native'}:${transfer.amount||'0'}`;
        const row=await db.query(`INSERT INTO chain_alert_events(watch_target_id,provider,network,external_event_id,signature,event_type,wallet_address,mint,amount_raw,payload)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $9~'^[0-9]+$' THEN $9::numeric ELSE NULL END,$10)
          ON CONFLICT(external_event_id) DO NOTHING`,[target.id,provider,network,externalEventId,signature,firstString(event?.type,event?.eventType)||'wallet_activity',target.address,transfer.mint||null,transfer.amount||null,JSON.stringify(event)]);
        inserted+=row.rowCount||0;
      }
    }
    return Response.json({ok:true,received:events.length,inserted},{status:202});
  }catch(error){return jsonError(error,requestId);}
}
