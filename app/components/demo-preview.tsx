'use client';

import {useEffect,useMemo,useState} from 'react';
import {DEMO_CATEGORIES,DEMO_CLIPS} from '@/lib/demo-clips';

export default function DemoPreview({compact=false}:{compact?:boolean}){
  const [category,setCategory]=useState<(typeof DEMO_CATEGORIES)[number]['key']>('all');
  const [activeSlug,setActiveSlug]=useState('pokimane');
  const [captionIndex,setCaptionIndex]=useState(0);
  const filtered=useMemo(()=>{
    if(category==='all')return DEMO_CLIPS;
    if(category==='speed-kai')return DEMO_CLIPS.filter(clip=>clip.slug==='ishowspeed'||clip.slug==='kai-cenat');
    if(category==='pokimane-amouranth')return DEMO_CLIPS.filter(clip=>clip.slug==='pokimane'||clip.slug==='amouranth');
    return DEMO_CLIPS.filter(clip=>clip.category===category);
  },[category]);
  const active=filtered.find(clip=>clip.slug===activeSlug)||filtered[0]||DEMO_CLIPS[0];
  const captionWords=active.caption.slice(0,captionIndex+1).join(' ');

  useEffect(()=>{setCaptionIndex(0);setActiveSlug(current=>filtered.some(clip=>clip.slug===current)?current:filtered[0]?.slug||'pokimane');},[category,filtered]);
  useEffect(()=>{
    setCaptionIndex(0);
    const timer=window.setInterval(()=>setCaptionIndex(index=>index>=active.caption.length-1?0:index+1),900);
    return()=>window.clearInterval(timer);
  },[active.slug,active.caption.length]);

  return <section className={`demo-preview ${compact?'demo-preview-compact':''}`} id={compact?'':'demo-preview'} aria-labelledby={`${compact?'compact-':''}demo-preview-title`}>
    <div className="demo-preview-heading"><div><span className="opus-kicker">PUMPCLIPS / DEMO PREVIEW</span><h2 id={`${compact?'compact-':''}demo-preview-title`}>One player.<br/><em>Every kind of signal.</em></h2><p>Switch between live creator references and see how PumpClip frames a sharp vertical moment.</p></div><span className="demo-preview-ratio">9:16 / AI CAPTIONS</span></div>
    <div className="demo-preview-filters" role="tablist" aria-label="Filter demo streamers">{DEMO_CATEGORIES.map(item=><button type="button" role="tab" aria-selected={category===item.key} className={category===item.key?'is-active':''} key={item.key} onClick={()=>setCategory(item.key)}>{item.label}</button>)}</div>
    <div className="demo-preview-layout"><div className="demo-preview-player-shell"><div className="demo-preview-topbar"><span><i/> SOURCE PLAYER</span><small>{active.duration} · {active.aspectRatio}</small></div><div className={`demo-preview-frame demo-preview-accent-${active.accent}`}><iframe key={active.slug} src={active.embedUrl} title={`${active.name} demo clip`} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/><div className="demo-preview-caption" aria-live="polite"><span className="demo-caption-label">AI CAPTIONS</span><strong>{captionWords}</strong></div><span className="demo-preview-watermark">PUMPCLIP</span></div></div><div className="demo-preview-roster" role="list" aria-label="Featured streamer clips">{filtered.map(clip=><button type="button" role="listitem" className={`demo-streamer-tab ${active.slug===clip.slug?'is-active':''}`} key={clip.slug} onClick={()=>setActiveSlug(clip.slug)}><span className={`demo-streamer-avatar demo-avatar-${clip.accent}`}>{clip.initials}</span><span><strong>{clip.name}</strong><small>{clip.role}</small></span><b>{clip.duration}</b></button>)}</div></div>
  </section>;
}

export {DEMO_CLIPS};
