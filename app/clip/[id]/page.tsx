'use client';

import {useEffect,useState} from 'react';
import {TradeModal} from '@/app/dashboard/trading-alerts';
import './clip.css';

type LinkData={id:string;url:string;platform:string;clipperName:string;campaignTitle?:string|null;streamerName:string;mint?:string|null;tradeEligible:boolean;feeBps:number};
type TradeAlert={id:string;kind:string;provider:string;mint:string|null;created_at:string;status:string;clip_links:never[]};

export default function ClipLandingPage({params}:{params:Promise<{id:string}>}){
  const [data,setData]=useState<LinkData|null>(null),[notFound,setNotFound]=useState(false),[loading,setLoading]=useState(true),[tradeOpen,setTradeOpen]=useState(false),[signedIn,setSignedIn]=useState(false);
  useEffect(()=>{let active=true;void (async()=>{try{const {id}=await params;const [link,me]=await Promise.all([fetch(`/api/v1/clip-links/${encodeURIComponent(id)}`,{cache:'no-store'}),fetch('/api/v1/me',{cache:'no-store'})]);if(!active)return;if(!link.ok){setNotFound(true);return;}setData(await link.json());setSignedIn(me.ok);}catch{if(active)setNotFound(true);}finally{if(active)setLoading(false);}})();return()=>{active=false;};},[params]);
  if(loading)return <main className="clip-landing"><p role="status">Loading clip…</p></main>;
  if(notFound||!data)return <main className="clip-landing"><a href="/">pumpclips</a><h1>This clip link is unavailable.</h1><p>It may have been removed or its campaign is no longer live.</p></main>;
  const alert:TradeAlert={id:data.id,kind:'stream',provider:'live stream',mint:data.mint||null,created_at:new Date().toISOString(),status:'processed',clip_links:[]};
  return <main className="clip-landing"><header><a href="/">pumpclips</a><span>CLIP / VERIFIED ATTRIBUTION</span></header><section className="clip-landing-card"><p className="clip-platform">{data.platform.replace('_',' ').toUpperCase()} SHORT</p><h1>{data.campaignTitle||'A clip worth a closer look.'}</h1><p>Shared by <strong>{data.clipperName}</strong>{data.streamerName?<> · featuring <strong>{data.streamerName}</strong></>:null}</p><a className="clip-watch" href={data.url} target="_blank" rel="noopener noreferrer">Watch the original clip </a>{data.tradeEligible&&data.mint&&<section className="clip-trade-callout"><p>Buy from this clip. A <strong>1.00% PumpClip attribution fee</strong> applies to buys: 0.40% to the clipper, 0.40% to the streamer, and 0.20% to PumpClip. The full fee is sent to the disclosed treasury in the wallet-signed transaction; credits are posted after confirmation.</p>{signedIn?<button type="button" onClick={()=>setTradeOpen(true)}>Review token buy </button>:<a href={`/auth?next=${encodeURIComponent(`/clip/${data.id}`)}`}>Sign in to trade </a>}</section>}</section>{tradeOpen&&data.mint&&<TradeModal alert={alert} clipLinkId={data.id} onClose={()=>setTradeOpen(false)}/>}<footer>Trading is optional. Review the amount, route, fee, and slippage in your wallet before approving.</footer></main>;
}
