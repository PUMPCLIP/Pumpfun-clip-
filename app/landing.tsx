'use client';

import {FormEvent, useEffect, useMemo, useState} from 'react';

type Clip={id:string;clipper_id:string;clipper_name:string;campaign_title:string;target_platforms:string[];video_url:string;view_count:number};
type Person={id:string;display_name:string;roles:string[];accepted_count:number;total_views:number;reputation_score:number;earned_lamports?:number;campaign_count?:number;video_url?:string;campaign_title?:string};

const platforms=[['▶','YouTube'],['♪','TikTok'],['◎','Instagram'],['in','LinkedIn'],['𝕏','X / Twitter']];
const mockClips=[
  {label:'THE CONTRARIAN TAKE',score:99,gradient:'linear-gradient(145deg,#314d39,#0b1811)'},
  {label:'BUILD IN PUBLIC',score:98,gradient:'linear-gradient(145deg,#4b3c72,#11101f)'},
  {label:'THE ROOM WENT SILENT',score:94,gradient:'linear-gradient(145deg,#625038,#17100b)'},
  {label:'LATE NIGHT BUILD LOGS',score:97,gradient:'linear-gradient(145deg,#203f54,#0b1118)'}
];
const logos=['YouTube','Twitch','TikTok','Instagram','LinkedIn','X'];

function compact(value:number){return new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(Number(value||0));}
function earned(lamports:number){const sol=Number(lamports||0)/1_000_000_000;return sol?`${sol.toFixed(sol<1?.2:1)} SOL earned`:'Rewards starting';}

export default function Landing(){
  const [clips,setClips]=useState<Clip[]>([]);
  const [people,setPeople]=useState<Person[]>([]);
  const [ready,setReady]=useState(false);
  const [url,setUrl]=useState('');
  const [selectedPlatform,setSelectedPlatform]=useState('YouTube');
  const [message,setMessage]=useState('');

  useEffect(()=>{
    Promise.allSettled([
      fetch('/api/v1/feed?limit=12').then(r=>r.ok?r.json():{items:[]}),
      fetch('/api/v1/profiles?limit=60').then(r=>r.ok?r.json():{items:[]})
    ]).then(([feed,network])=>{
      if(feed.status==='fulfilled')setClips(feed.value.items||[]);
      if(network.status==='fulfilled')setPeople(network.value.items||[]);
      setReady(true);
    });
  },[]);

  const visiblePeople=useMemo(()=>people,[people]);
  const submitUrl=(event:FormEvent)=>{
    event.preventDefault();
    if(!url.trim()){setMessage('Paste a public video link to get started.');return;}
    setMessage(`Ready to clip from ${selectedPlatform}. Sign in to continue.`);
  };

  return <main className="opus-landing">
    <header className="opus-nav"><a className="opus-logo" href="/"><span>◒</span> PUMPCLIP</a><nav><a href="#showcase">Showcase</a><a href="/people">Creators + clippers</a><a href="/feed">Watch feed</a></nav><div className="opus-nav-actions"><a className="opus-login" href="/api/v1/auth/google/start">Sign in</a><a className="opus-cta" href="/dashboard">Open workspace <span>↗</span></a></div></header>

    <section className="opus-hero opus-hero-expanded"><div className="opus-hero-copy"><span className="opus-kicker">THE AI CLIPPING WORKSPACE / 001</span><h1>Turn long video<br/><em>into momentum.</em></h1><p>Drop in a long-form video. PumpClip finds the moments worth sharing, then lets creators and clippers turn them into rewards.</p>
      <form className="opus-url-form" onSubmit={submitUrl}><div className="opus-url-row"><span className="url-link-icon">↗</span><input value={url} onChange={event=>setUrl(event.target.value)} placeholder="Drop a long video link (YouTube, Twitch, podcast)..." aria-label="Long video URL"/><button type="submit">Get clips <span>↗</span></button></div><div className="platform-pills">{platforms.map(([icon,name])=><button type="button" className={selectedPlatform===name?'selected':''} key={name} onClick={()=>setSelectedPlatform(name)}><b>{icon}</b>{name}</button>)}</div></form>{message&&<div className="opus-form-message" role="status">{message}<a href="/api/v1/auth/google/start"> Sign in ↗</a></div>}<small className="opus-note">Licensed source · Creator review · Transparent rewards</small></div>
      <div className="opus-hero-demo"><div className="demo-browser"><div className="demo-top"><span>● ● ●</span><small>pumpclip / auto-clipping</small><b>9:16</b></div><div className="demo-video"><div className="demo-orb orb-one"/><div className="demo-orb orb-two"/><span className="demo-play">▶</span><strong>Make this<br/><em>moment count.</em></strong><small>AI clipping · creator review · fair rewards</small></div><div className="demo-timeline"><span>00:42</span><i/><i/><i/><i/><i/><i/><span>01:12</span></div></div><div className="demo-sticker">AI<br/><b>→</b> CLIP</div></div></section>

    <section className="opus-proof"><span>USED BY PEOPLE WHO MAKE THE INTERNET MOVE</span><i/><span>9:16 READY</span><i/><span>CREATOR REVIEW</span><i/><span>REWARD THE WORK</span></section>

    <section className="opus-showcase opus-carousel-section" id="showcase"><div className="opus-section-heading"><div><span className="opus-kicker">AI CLIP PREVIEW / LIVE SIGNAL</span><h2>Find the hook.<br/><em>Make it travel.</em></h2></div><a href="/feed">Open live feed <span>↗</span></a></div><div className="opus-carousel" aria-label="Generated vertical clip previews">{clips.length?clips.slice(0,6).map((clip,index)=><a className="opus-clip" key={clip.id} href={'/profile/'+clip.clipper_id}><video src={clip.video_url} muted autoPlay loop playsInline preload="metadata"/><div className="opus-clip-shade"/><span className="viral-score">{[99,98,94,97,96,92][index%6]}</span><div className="opus-clip-copy"><span>{clip.target_platforms?.join(' · ')||'ACCEPTED CUT'}</span><strong>{clip.campaign_title}</strong><small>@{clip.clipper_name} · {compact(clip.view_count)} views</small></div><b>↗</b></a>):ready?mockClips.map(mock=><div className="opus-clip opus-mock-clip" style={{background:mock.gradient}} key={mock.label}><div className="mock-play">▶</div><span className="viral-score">{mock.score}</span><div className="opus-clip-copy"><span>AI CLIP PREVIEW</span><strong>{mock.label}</strong><small>Upload a video to generate your cut</small></div></div>):Array.from({length:4}).map((_,index)=><div className="opus-clip opus-skeleton" key={index}><span className="skeleton-circle"/><span className="skeleton-line wide"/><span className="skeleton-line"/></div>)}</div></section>

    <section className="opus-network opus-top-creators"><div className="opus-section-heading"><div><span className="opus-kicker">THE NETWORK / {people.length||'—'} PUBLIC PROFILES</span><h2>Used by top creators,<br/><em>streamers, and clippers.</em></h2></div><a href="/people">View all people <span>↗</span></a></div><div className="opus-people-grid opus-people-grid-rich">{visiblePeople.length?visiblePeople.map(person=><a className="opus-person" key={person.id} href={'/profile/'+person.id}><span className="opus-person-avatar">{person.display_name.slice(0,2).toUpperCase()}</span><div><strong>{person.display_name}</strong><small>{person.roles.map(role=>role==='streamer'?'Creator':'Clipper').join(' · ')}</small></div><b>{person.roles.includes('clipper')?earned(Number(person.earned_lamports||0)):compact(Number(person.campaign_count||0))+' campaigns'}<small>{person.roles.includes('clipper')?'earned':'published'}</small></b>{person.video_url&&<video src={person.video_url} muted autoPlay loop playsInline preload="metadata"/>}</a>):ready?Array.from({length:6}).map((_,index)=><div className="opus-person opus-person-placeholder" key={index}><span className="opus-person-avatar">{index<3?'CR':'CL'}</span><div><strong>{index<3?'Creator profile':'Upcoming clipper'}</strong><small>{index<3?'Source publisher':'Editor in the network'}</small></div><b>{index<3?'Launch':'Earn'}<small>with PumpClip</small></b></div>):Array.from({length:6}).map((_,index)=><div className="opus-person opus-person-skeleton" key={index}><span className="skeleton-avatar"/><div><span className="skeleton-line wide"/><span className="skeleton-line"/></div></div>)}</div><div className="opus-logo-ticker" aria-label="Supported creator platforms">{logos.map(logo=><span key={logo}>{logo}</span>)}</div></section>

    <section className="opus-final"><span className="opus-kicker">START WITH THE MOMENT</span><h2>Bring the source.<br/><em>We’ll help it travel.</em></h2><a className="opus-primary" href="/dashboard">Open your workspace <span>↗</span></a></section><footer className="opus-footer"><a className="opus-logo" href="/"><span>◒</span> PUMPCLIP</a><span>Creators own the source. Clippers earn the reach.</span><a href="/people">Explore the network ↗</a></footer>
  </main>;
}
