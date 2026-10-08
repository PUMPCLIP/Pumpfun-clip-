import {jsonError} from '@/lib/auth';
export const runtime='nodejs';
const origin='https://pump.fun';
function decode(value:string){return value.replace(/&amp;/g,'&').replace(/&#x27;/g,"'").replace(/&quot;/g,'"').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}
export async function GET(){try{
  const response=await fetch(`${origin}/live`,{headers:{accept:'text/html'},signal:AbortSignal.timeout(12000),next:{revalidate:30}});
  if(!response.ok)throw new Error(`Pump.fun live page returned ${response.status}`);
  const html=await response.text();
  const items=[];const seen=new Set<string>();
  const pattern=/href=["'](?:https:\/\/pump\.fun)?\/coin\/([A-Za-z0-9]+pump)["'][^>]*>([\s\S]{0,240})<\/a>/gi;
  for(const match of html.matchAll(pattern)){
    const mint=match[1];if(seen.has(mint))continue;seen.add(mint);
    const title=decode(match[2]).replace(/^LIVE\s*/i,'').slice(0,100)||`Pump.fun stream ${mint.slice(0,8)}`;
    items.push({mint,title,url:`${origin}/coin/${mint}`,status:'live'});if(items.length>=24)break;
  }
  return Response.json({source:origin+'/live',updatedAt:new Date().toISOString(),items},{headers:{'cache-control':'public, max-age=30, stale-while-revalidate=120'}});
}catch(error){return jsonError(error,crypto.randomUUID());}}
