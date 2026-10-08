'use client';

import {useEffect,useMemo,useState} from 'react';
import styles from './discover.module.css';
import SolTipModal from './sol-tip-modal';

type Campaign={id:string;title:string;description?:string|null;category?:string|null;state:string;source_url?:string|null;target_platforms?:string[];streamer_name?:string};
type LiveItem={mint:string;title:string;url:string;status:string};
type ListResponse<T>={items?:T[]};

const clipHref=(sourceUrl?:string|null)=>{
  const params=new URLSearchParams({view:'clip-engine'});
  if(sourceUrl)params.set('sourceUrl',sourceUrl);
  return `/dashboard?${params.toString()}`;
};

export default function DiscoverPage(){
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [streams,setStreams]=useState<LiveItem[]>([]);
  const [campaignLoading,setCampaignLoading]=useState(true);
  const [streamLoading,setStreamLoading]=useState(true);
  const [campaignError,setCampaignError]=useState('');
  const [streamError,setStreamError]=useState('');
  const [category,setCategory]=useState('All');
  const [tipOpen,setTipOpen]=useState(false);

  useEffect(()=>{
    const controller=new AbortController();
    const loadCampaigns=async()=>{
      try{
        const response=await fetch('/api/v1/campaigns',{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error('Campaigns are temporarily unavailable.');
        const data=await response.json() as ListResponse<Campaign>;
        setCampaigns(Array.isArray(data.items)?data.items:[]);
      }catch(error){if(!controller.signal.aborted)setCampaignError(error instanceof Error?error.message:'Campaigns are temporarily unavailable.');}
      finally{if(!controller.signal.aborted)setCampaignLoading(false);}
    };
    const loadStreams=async()=>{
      try{
        const response=await fetch('/api/v1/pumpfun/live',{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error('Pump.fun listings are temporarily unavailable.');
        const data=await response.json() as ListResponse<LiveItem>;
        setStreams(Array.isArray(data.items)?data.items:[]);
      }catch(error){if(!controller.signal.aborted)setStreamError(error instanceof Error?error.message:'Pump.fun listings are temporarily unavailable.');}
      finally{if(!controller.signal.aborted)setStreamLoading(false);}
    };
    void loadCampaigns();void loadStreams();
    return()=>controller.abort();
  },[]);

  const categories=useMemo(()=>['All',...Array.from(new Set(['Pump.fun Live',...campaigns.map(item=>item.category?.trim()).filter((value):value is string=>Boolean(value))]))],[campaigns]);
  const visibleCampaigns=useMemo(()=>category==='All'?campaigns:campaigns.filter(item=>(item.category||'General')===category),[campaigns,category]);
  const showStreams=category==='All'||category==='Pump.fun Live';

  return <main className={styles.page}>
    <header className={styles.header}>
      <a className={styles.brand} href="/"><img src="/logo.svg" alt=""/><span>pumpclips</span></a>
      <nav aria-label="Main navigation"><a href="/people">Creators</a><a href="/feed">Clips</a><a className={styles.signIn} href="/auth">Sign in ↗</a></nav>
    </header>

    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>LIVE DISCOVERY / PUMP.FUN + CREATOR CAMPAIGNS</p>
        <h1>Find the next<br/><em>moment.</em></h1>
        <p>Browse live Pump.fun streams and active creator briefs. When you find a source worth clipping, send it into your private video workspace.</p>
        <div className={styles.heroActions}><a className={styles.primary} href={clipHref()}>Open Clip Engine ↗</a><a className={styles.secondary} href="/people">Browse creators</a><button className={styles.secondary} type="button" onClick={()=>setTipOpen(true)}>Send SOL / Tip Creator</button></div>
      </div>
      <aside className={styles.heroStats} aria-label="Current discovery inventory">
        <div><strong>{streamLoading?'—':streams.length}</strong><span>LIVE PUMP.FUN LISTINGS</span></div>
        <div><strong>{campaignLoading?'—':campaigns.length}</strong><span>ACTIVE CAMPAIGNS</span></div>
        <p>Listings refresh from the live feed; campaign cards come from the marketplace API.</p>
      </aside>
    </section>

    <section className={styles.filters} aria-label="Filter discovery categories">
      <div><span className={styles.eyebrow}>EXPLORE BY CATEGORY</span><p>Categories are drawn from current live campaigns, alongside the live Pump.fun feed.</p></div>
      <div className={styles.chips} role="tablist" aria-label="Discovery categories">
        {categories.map(item=><button key={item} type="button" role="tab" aria-selected={category===item} className={category===item?styles.activeChip:''} onClick={()=>setCategory(item)}>{item}</button>)}
      </div>
    </section>

    {showStreams&&<section className={styles.section} aria-labelledby="pumpfun-title">
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>LIVE MIRROR / PUMP.FUN</p><h2 id="pumpfun-title">Streams happening now.</h2><p>Pump.fun hosts the player; open the official stream or pass its source into your clip workspace.</p></div><span className={styles.livePill}><i/> LIVE CATALOG</span></div>
      {streamLoading?<p className={styles.state} role="status">Refreshing live Pump.fun listings…</p>:streamError?<p className={styles.error} role="alert">{streamError}</p>:streams.length===0?<p className={styles.state}>No active Pump.fun streams detected right now.</p>:<div className={styles.streamGrid}>{streams.slice(0,24).map(item=><article className={styles.streamCard} key={item.mint}>
        <div className={styles.cardTop}><span className={styles.liveTag}><i/> LIVE</span><span className={styles.categoryTag}>PUMP.FUN LIVE</span></div>
        <h3>{item.title||`Pump.fun stream ${item.mint.slice(0,8)}`}</h3>
        <p className={styles.mint}>TOKEN / {item.mint.slice(0,10)}…{item.mint.slice(-5)}</p>
        <div className={styles.cardActions}><a href={clipHref(item.url)}>Create a clip ↗</a><a href={item.url} target="_blank" rel="noreferrer">Open stream ↗</a></div>
      </article>)}</div>}
      <p className={styles.sourceNote}>The official player remains hosted by Pump.fun. Clip jobs are private to your account and require sign-in, clipper access, and available credits.</p>
    </section>}

    {(category==='All'||category!=='Pump.fun Live')&&<section className={styles.section} aria-labelledby="campaign-title">
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>CREATOR MARKETPLACE / {visibleCampaigns.length} CAMPAIGNS</p><h2 id="campaign-title">Briefs open for creators.</h2><p>Campaign categories and sources are loaded from the live marketplace.</p></div><a className={styles.textLink} href="/dashboard?view=discover">Open campaign workspace ↗</a></div>
      {campaignLoading?<p className={styles.state} role="status">Loading active campaigns…</p>:campaignError?<p className={styles.error} role="alert">{campaignError}</p>:visibleCampaigns.length===0?<p className={styles.state}>No live campaigns in this category right now.</p>:<div className={styles.campaignGrid}>{visibleCampaigns.map(item=><article className={styles.campaignCard} key={item.id}>
        <div className={styles.cardTop}><span className={styles.categoryTag}>{item.category||'General'}</span><span className={styles.campaignState}>{item.state}</span></div>
        <h3>{item.title}</h3><p>{item.description||'Creator campaign brief.'}</p>
        {item.streamer_name&&<small className={styles.streamer}>BY {item.streamer_name.toUpperCase()}</small>}
        <div className={styles.cardActions}>{item.source_url&&<a href={clipHref(item.source_url)}>Create a clip ↗</a>}<a href="/dashboard?view=discover">Open in workspace ↗</a></div>
      </article>)}</div>}
    </section>}

    <section className={styles.bottomCta}><div><p className={styles.eyebrow}>FROM DISCOVERY TO DELIVERY</p><h2>Turn a source into a cut.</h2><p>Sign in with email or Google, then queue a private clipping job and follow its render status in the Clip Engine.</p></div><a className={styles.primary} href={clipHref()}>Start clipping ↗</a></section>
    <footer className={styles.footer}><a className={styles.brand} href="/"><img src="/logo.svg" alt=""/><span>pumpclips</span></a><span>Live listings from Pump.fun · campaign data from PumpClip</span><a href="/people">Creator directory ↗</a></footer>
    {tipOpen&&<SolTipModal onClose={()=>setTipOpen(false)}/>}
  </main>;
}
