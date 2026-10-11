import crypto from 'node:crypto';
import {ApiError} from './auth';

export type StreamProvider='kick'|'twitch'|'youtube'|'custom';
export type ChainProvider='helius'|'quicknode'|'custom';

export function verifyWebhookSecret(request:Request,secret:string,header='x-pumpclip-webhook-secret') {
  if(!secret) throw new ApiError('WEBHOOK_NOT_CONFIGURED',503,'This webhook is not configured yet.');
  const supplied=request.headers.get(header)||request.headers.get('authorization')?.replace(/^Bearer\s+/i,'')||'';
  const a=Buffer.from(supplied),b=Buffer.from(secret);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) throw new ApiError('INVALID_WEBHOOK_SECRET',401);
}
export async function readJson(request:Request,maxBytes=1_500_000):Promise<any> {
  const text=await request.text();
  if(Buffer.byteLength(text)>maxBytes) throw new ApiError('WEBHOOK_TOO_LARGE',413);
  try{return JSON.parse(text);}catch{throw new ApiError('INVALID_WEBHOOK_PAYLOAD',422);}
}
function values(value:any,key:string,output:string[],depth=0) {
  if(depth>4||output.length>80||value===null||value===undefined)return;
  if(typeof value==='string') {if(value.trim())output.push(value.trim().slice(0,500));return;}
  if(Array.isArray(value)){for(const item of value.slice(0,20))values(item,key,output,depth+1);return;}
  if(typeof value==='object') for(const [childKey,childValue] of Object.entries(value)) {
    if(/message|title|description|content|body|text|channel|streamer|creator|mention|username/i.test(childKey)) values(childValue,childKey,output,depth+1);
  }
}
export function matchedTerms(payload:any) {
  const terms=(process.env.STREAM_ALERT_TERMS||'').split(',').map(item=>item.trim().toLowerCase()).filter(Boolean).slice(0,50);
  if(!terms.length)return [];
  const text:string[]=[];values(payload,'',text);
  const haystack=text.join('\n').toLowerCase();
  return terms.filter(term=>haystack.includes(term));
}
export function payloadId(payload:any,fallback:string) {
  const candidate=payload?.id||payload?.event_id||payload?.eventId||payload?.metadata?.event_id||payload?.data?.id;
  return typeof candidate==='string'&&candidate.length<=240?candidate:crypto.createHash('sha256').update(fallback).digest('hex');
}
export function firstString(...values:any[]) {return values.find(value=>typeof value==='string'&&value.trim())?.trim()||'';}
