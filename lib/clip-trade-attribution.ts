import {one} from './db';
import {ApiError} from './auth';
import {PublicKey} from '@solana/web3.js';

export type ClipTradeAttribution={clipLinkId:string;clipperUserId:string;streamerUserId:string;campaignId:string|null;streamAlertEventId:string;mint:string};

export function mintFromAlertPayload(value:unknown):string|null{
  if(!value||typeof value!=='object')return null;
  const root=value as Record<string,unknown>;
  const nested=root.data&&typeof root.data==='object'?root.data as Record<string,unknown>:{};
  const candidate=[root.mint,root.token_mint,root.tokenMint,root.ca,root.contractAddress,nested.mint,nested.token_mint,nested.tokenMint,nested.ca].find(v=>typeof v==='string'&&v.length>0);
  if(typeof candidate!=='string')return null;
  try{return new PublicKey(candidate).toBase58();}catch{return null;}
}

export async function resolveClipTradeAttribution(clipLinkId:string,tradeMint:string):Promise<ClipTradeAttribution>{
  const row=await one<any>(`SELECT cl.id,cl.owner_id,cl.campaign_id,cl.stream_alert_event_id,cl.active,
      e.status AS alert_status,e.payload,s.owner_id AS source_owner_id,
      c.streamer_id AS campaign_streamer_id,c.state AS campaign_state
    FROM clip_links cl
    LEFT JOIN stream_alert_events e ON e.id=cl.stream_alert_event_id
    LEFT JOIN stream_sources s ON s.id=e.source_id
    LEFT JOIN campaigns c ON c.id=cl.campaign_id
    WHERE cl.id=$1`,[clipLinkId]);
  if(!row||!row.active)throw new ApiError('CLIP_LINK_NOT_FOUND',404);
  if(!row.stream_alert_event_id||!row.alert_status||!['queued','processed'].includes(row.alert_status))throw new ApiError('CLIP_LINK_NOT_TRADEABLE',422,'Only an active live-stream alert clip can be used for an attributed buy.');
  if(row.campaign_id&&row.campaign_state!=='live')throw new ApiError('CAMPAIGN_NOT_LIVE',409,'The linked campaign is not live.');
  const streamerUserId=row.campaign_streamer_id||row.source_owner_id;
  if(!streamerUserId)throw new ApiError('STREAMER_WALLET_OWNER_REQUIRED',422);
  if(row.campaign_streamer_id&&row.source_owner_id&&row.campaign_streamer_id!==row.source_owner_id)throw new ApiError('ATTRIBUTION_STREAMER_MISMATCH',422);
  const alertMint=mintFromAlertPayload(row.payload);
  if(!alertMint)throw new ApiError('ALERT_MINT_REQUIRED',422,'This live-stream alert has no verified token mint.');
  if(alertMint!==tradeMint)throw new ApiError('CLIP_MINT_MISMATCH',422,'This clip is linked to a different token.');
  return {clipLinkId:row.id,clipperUserId:row.owner_id,streamerUserId,campaignId:row.campaign_id||null,streamAlertEventId:row.stream_alert_event_id,mint:alertMint};
}
